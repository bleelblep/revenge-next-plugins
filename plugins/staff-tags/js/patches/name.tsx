import { after } from '@revenge-mod/patcher'
import { getModuleByPath } from '../../../../shared/modules'
import { DEFAULTS } from '../index'
import { findInReactTree } from '../lib/findInReactTree'
import getTag, { isBuiltInTag } from '../lib/getTag'
import type { StaffTagsStorage } from '../index'

/**
 * Profile header tag -- `modules/user_profile/native/UserProfilePrimaryInfo.tsx`.
 *
 * The file exports `default` (the whole header) and `DisplayName` (name + bot tag row) by
 * name. `withName("DisplayName")` never matched it: withName checks function names, which
 * 349.5 minifies, and DisplayName was already a named export rather than `default` on 348.5.
 * `HeaderName`, which used to hand DisplayName a `channelId`, no longer exists at all.
 *
 * `default` renders DisplayName through its own module scope, not the exports object, so
 * patching `ns.DisplayName` changes nothing. Instead: `after` on `default`, find the element
 * whose `type` is DisplayName and swap in a wrapper that adds the tag to DisplayName's output.
 *
 * DisplayName's output (349.5): one row whose children are `[name, botTag | null, chevron?]`,
 * the bot tag being a component with a static `Types`. A built-in tag (bot, system) is kept;
 * otherwise the staff tag replaces a non-built-in one, or goes right after the name.
 *
 * The approach -- find by source path, `after` on the render, leave the tree alone when its shape
 * doesn't match -- follows kmmiio99o's Hide Call Buttons rework (PR #7, callButtons.ts).
 */
const PATH = 'modules/user_profile/native/UserProfilePrimaryInfo.tsx'

const clone = (element: any, props: any): any =>
	(revenge as any).react.React.cloneElement(element, props)

/**
 * Copy of `root` with the first node matching `match` replaced by `replace(node)`, cloning
 * only its ancestors. Discord's compiler caches rendered elements across renders, so editing
 * them in place would apply the change again on every re-render.
 */
function replaceInTree(
	root: any,
	match: (node: any) => boolean,
	replace: (node: any) => any,
	depth = 0,
): any {
	if (!root || typeof root !== 'object' || depth > 30) return root
	if (match(root)) return replace(root)
	const children = root.props?.children
	if (Array.isArray(children)) {
		for (let i = 0; i < children.length; i++) {
			const next = replaceInTree(children[i], match, replace, depth + 1)
			if (next !== children[i]) {
				const copy = [...children]
				copy[i] = next
				return clone(root, { children: copy })
			}
		}
	} else if (children && typeof children === 'object') {
		const next = replaceInTree(children, match, replace, depth + 1)
		if (next !== children) return clone(root, { children: next })
	}
	return root
}

export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	let tagModule: any
	const unsubscribeTag = getModules(withProps('getBotLabel'), (mod: any) => {
		tagModule = mod
	})

	const { GuildStore, ChannelStore, SelectedChannelStore } = revenge.discord
		.flux.Stores as any

	/** The open channel, when it belongs to the profile's guild -- for channel-level mod roles. */
	const channelFor = (guildId: string | undefined) => {
		const channel = ChannelStore?.getChannel?.(
			SelectedChannelStore?.getChannelId?.(),
		)
		return guildId && channel?.guild_id === guildId ? channel : undefined
	}

	const addTag = (ret: any, props: any) => {
		const { guildId, user } = props ?? {}
		if (!user || !guildId) return ret

		const tagComponent = findInReactTree(ret, (c: any) => c?.type?.Types)
		if (tagComponent && isBuiltInTag(tagComponent.props.type)) return ret

		const tag = getTag(
			GuildStore.getGuild(guildId),
			channelFor(guildId),
			user,
			!!(jsonStorage.cache ?? DEFAULTS).useRoleColor,
		)
		if (!tag) return ret

		if (tagComponent) {
			return replaceInTree(
				ret,
				(c: any) => c === tagComponent,
				(c: any) => clone(c, { type: 0, ...tag }),
			)
		}

		if (!tagModule?.default) return ret
		const isRow = (c: any) =>
			Array.isArray(c?.props?.children) && c.props.children.length >= 2
		const TagModule = tagModule
		const element = (
			<TagModule.default
				key="staff-tag"
				style={{ marginLeft: 0 }}
				type={0}
				text={tag.text}
				textColor={tag.textColor}
				backgroundColor={tag.backgroundColor}
				gradientColor={tag.gradientColor}
				icon={tag.icon}
				customSvg={tag.customSvg}
				iconOnly={tag.iconOnly}
				verified={tag.verified}
			/>
		)
		// Discord leaves the bot-tag slot (index 1) empty for people; use it so the tag sits
		// right after the name and before the chevron.
		return replaceInTree(ret, isRow, (row: any) => {
			const children = [...row.props.children]
			if (!children[1]) children[1] = element
			else children.splice(1, 0, element)
			return clone(row, { children })
		})
	}

	// One wrapper per DisplayName function, so React sees a stable component type.
	type Render = (props: any) => any
	const wrappers = new WeakMap<Render, Render>()
	const wrap = (DisplayName: Render) => {
		let wrapper = wrappers.get(DisplayName)
		if (!wrapper) {
			wrapper = (props: any) => {
				const ret = DisplayName(props)
				try {
					return addTag(ret, props)
				} catch (error) {
					console.error('[StaffTags] profile tag:', error)
					return ret
				}
			}
			wrappers.set(DisplayName, wrapper)
		}
		return wrapper
	}

	const patches: Array<() => void> = []

	const unsubscribePath = getModuleByPath(
		PATH,
		null,
		(ns: any) => {
			const DisplayName = ns?.DisplayName
			if (
				typeof ns?.default !== 'function' ||
				typeof DisplayName !== 'function'
			) {
				console.warn('[StaffTags] profile: nothing to patch')
				return
			}
			let logged = false
			patches.push(
				after(ns, 'default', (ret: any) => {
					try {
						const Wrapped = wrap(DisplayName)
						const out = replaceInTree(
							ret,
							(c: any) => c?.type === DisplayName,
							(c: any) =>
								(revenge as any).react.React.createElement(Wrapped, {
									...c.props,
									key: c.key,
								}),
						)
						if (!logged) {
							logged = true
							console.log(
								`[StaffTags] profile: ${out === ret ? 'unchanged' : 'changed'}`,
							)
						}
						return out
					} catch (error) {
						console.error('[StaffTags] profile:', error)
						return ret
					}
				}),
			)
		},
		'[StaffTags]',
	)

	return () => {
		unsubscribeTag()
		unsubscribePath()
		patches.forEach(unpatch => unpatch())
	}
}
