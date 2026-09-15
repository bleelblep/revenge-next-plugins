import getTag, { isBuiltInTag } from "../lib/getTag"
import { findInReactTree } from "../lib/findInReactTree"
import { DEFAULTS, type StaffTagsStorage } from "../index"

// instead, not after: after's hook only receives the return value, not the original
// arguments (confirmed from revenge-bundle-next's own patcher source).
const rowPatch =
	(jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>, getTagModule: () => any, GuildStore: any) =>
	(args: any[], original: any) => {
		// Confirmed on-device crash (this exact surface, opening a server's member list):
		// "undefined is not a function" when the captured original wasn't actually a
		// function yet at patch time (a getModules match on partially-populated exports, or
		// the "type" property genuinely not being callable for this particular match). Never
		// assume it's callable.
		if (typeof original !== "function") return undefined
		const res = original(...args)
		const [{ guildId, user }] = args
		const label = res?.props?.label
		const nameContainer = findInReactTree(
			label,
			(c: any) =>
				Array.isArray(c?.props?.children) &&
				c.props.children.some(
					(ch: any) => typeof ch === "string" || typeof ch?.props?.children === "string",
				),
		)

		const existingTag = findInReactTree(nameContainer, (c: any) => c?.type?.Types)
		if (existingTag && isBuiltInTag(existingTag.props.type)) return res
		if (!nameContainer) return res

		const guild = GuildStore.getGuild(guildId)
		const tag = getTag(guild, undefined, user, !!(jsonStorage.cache ?? DEFAULTS).useRoleColor)

		if (tag) {
			if (existingTag) {
				Object.assign(existingTag.props, {
					type: 0,
					text: tag.text,
					textColor: tag.textColor,
					backgroundColor: tag.backgroundColor,
					verified: tag.verified,
				})
			} else {
				const TagModule = getTagModule()
				if (!TagModule?.default) return res

				if (!Array.isArray(nameContainer.props.children)) {
					nameContainer.props.children = [nameContainer.props.children]
				}
				nameContainer.props.children.push(
					<TagModule.default
						type={0}
						text={tag.text}
						textColor={tag.textColor}
						backgroundColor={tag.backgroundColor}
						verified={tag.verified}
					/>,
				)
			}
		}
		return res
	}

/**
 * A raw custom filter, built by hand instead of via `filters.withName` etc: matches a module
 * whose exports (or default export) is a `React.memo()` wrapper around a function named
 * `name` -- i.e. checks `exports.type.name`, not `exports.name`. `React.memo(function
 * UserRow(){...})` returns a plain `{ $$typeof, type, compare }` object with no `.name` of
 * its own, which `withName` (checks `.name` only) can never match -- but `.type.name` (the
 * wrapped function's own name) still is "UserRow". Shaped like `filters.withProps` et al.
 * (a predicate function with `.key`/`.flags`/`.scopes`) since `revenge.modules.finders`
 * doesn't expose a generic custom-predicate filter constructor to external plugins.
 *
 * IMPORTANT: `getModules`/`lookupModule` call `filter.scope(...)` as a *method*, not a
 * property read (confirmed from revenge-bundle-next's own source) -- a filter missing this
 * method throws immediately when passed to getModules, silently caught by our own
 * `apply()` wrapper in index.ts.
 */
function withMemoName(name: string) {
	const filter: any = (_id: number, exports: any) => exports?.type?.name === name
	filter.key = `revenge-next-plugins.memoName(${name})`
	filter.flags = 1 // FilterFlag.RequiresExports
	filter.scopes = 4 // FilterScopes.Initialized
	// Minimal stand-in for the real Helpers prototype (unexposed to external plugins):
	// getModules/lookupModule only ever call `.scope(...)`, never `.and()`/`.or()`/etc, for
	// filters passed in from here, so only that needs implementing.
	filter.scope = (...scopes: number[]) => {
		const scoped: any = (id: number, exports: any) => filter(id, exports)
		scoped.key = filter.key
		scoped.flags = filter.flags
		scoped.scopes = scopes.reduce((a, b) => a | b, 0)
		scoped.scope = filter.scope
		return scoped
	}
	return filter
}

// getModules, not lookupModule/lookupModules: confirmed on-device that a related lookup
// (getTagProperties in chat.ts) isn't loaded yet on a cold app restart even from inside
// start() -- it's part of the chat UI, which only initializes once the relevant screen
// actually renders. lookupModule/lookupModules give up immediately and permanently cache
// that as "not found"; getModules subscribes and calls back whenever the module loads.
export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const { getModules } = revenge.modules.finders
	const { withProps, withName } = revenge.modules.finders.filters

	let tagModule: any
	const getTagModule = () => tagModule
	getModules(withProps("getBotLabel"), (mod: any) => {
		tagModule = mod
	})

	// Flux stores are looked up by name directly through the Stores proxy, not a module
	// finder filter -- there is no `withStoreName` under modules.finders.filters. Confirmed
	// reliable even on a cold restart, unlike the UI-component lookups above/below.
	const { GuildStore } = revenge.discord.flux.Stores as any

	const patches: Array<() => void> = []
	const patchedAlready = new Set<any>()

	function patchUserRow(UserRow: any) {
		if (!UserRow || patchedAlready.has(UserRow)) return
		patchedAlready.add(UserRow)
		patches.push(revenge.patcher.instead(UserRow, "type", rowPatch(jsonStorage, getTagModule, GuildStore)))
	}

	// Try both: withName covers a build where UserRow isn't memo-wrapped (a plain named
	// function/class export), withMemoName covers the memo-wrapped case that was confirmed
	// to be what this build actually has. max: 10 since an unknown number of "UserRow"
	// closures may exist and getModules defaults to stopping after the first.
	const unsubscribeNamed = getModules(withName("UserRow"), patchUserRow, { max: 10 })
	const unsubscribeMemo = getModules(withMemoName("UserRow"), patchUserRow, { max: 10 })

	return () => {
		unsubscribeNamed()
		unsubscribeMemo()
		patches.forEach(unpatch => unpatch())
	}
}
