import getTag, { isBuiltInTag } from "../lib/getTag"
import { findInReactTree } from "../lib/findInReactTree"
import type { StaffTagsStorage } from "../index"

// getModules, not lookupModule: confirmed on-device that a related lookup (getTagProperties
// in chat.ts) isn't loaded yet on a cold app restart even from inside start() -- it's part
// of the chat UI, which only initializes once the relevant screen actually renders.
// lookupModule gives up immediately and permanently caches that as "not found"; getModules
// subscribes and calls back whenever the module actually loads.
export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const { getModules } = revenge.modules.finders
	const { withName, withProps } = revenge.modules.finders.filters

	// Read lazily (as `getTagModule()`) inside the DisplayName patch callback below, not
	// captured eagerly -- it may still be resolving when that callback is first defined.
	let tagModule: any
	getModules<any>(withProps("getBotLabel"), mod => {
		tagModule = mod
	})

	// Flux stores are looked up by name directly through the Stores proxy, not a module
	// finder filter -- there is no `withStoreName` under modules.finders.filters. Confirmed
	// reliable even on a cold restart, unlike the UI-component lookups below.
	const { GuildStore, ChannelStore } = revenge.discord.flux.Stores

	const patches: Array<() => void> = []

	// returnNamespace: true -- both patch `.default` below, so the wrapper object is needed
	// back, not the unwrapped function `withName` hands back by default.
	const unsubscribeHeader = getModules<any>(
		withName("HeaderName"),
		HeaderName => {
			if (!HeaderName?.default) return
			// instead, not after: after's hook only receives the return value, not the
			// original arguments (confirmed from revenge-bundle-next's own patcher source).
			patches.push(
				revenge.patcher.instead(HeaderName, "default", (args: any[], original: any) => {
					// Confirmed on-device crash elsewhere (tag.tsx): "undefined is not a
					// function" when the captured original wasn't actually a function yet at
					// patch time. Never assume it's callable.
					if (typeof original !== "function") return undefined
					const ret = original(...args)
					const [{ channelId }] = args
					if (ret?.props) ret.props.channelId = channelId
					return ret
				}),
			)
		},
		{ returnNamespace: true },
	)

	const unsubscribeDisplay = getModules<any>(
		withName("DisplayName"),
		DisplayName => {
			if (!DisplayName?.default) return
			// instead, not after: after's hook only receives the return value, not the
			// original arguments (confirmed from revenge-bundle-next's own patcher source).
			patches.push(
				revenge.patcher.instead(DisplayName, "default", (args: any[], original: any) => {
					// Confirmed on-device crash elsewhere (tag.tsx): "undefined is not a
					// function" when the captured original wasn't actually a function yet at
					// patch time. Never assume it's callable.
					if (typeof original !== "function") return undefined
					const ret = original(...args)
					const [{ guildId, channelId, user }] = args
					const tagComponent = findInReactTree(ret, (c: any) => c?.type?.Types)
					if (!tagComponent || !isBuiltInTag(tagComponent.props.type)) {
						const guild = GuildStore.getGuild(guildId)
						const channel = ChannelStore.getChannel(channelId)
						const tag = getTag(guild, channel, user, !!jsonStorage.cache.useRoleColor)

						if (tag) {
							if (tagComponent) {
								tagComponent.props = {
									type: 0,
									...tag,
								}
							} else {
								const row = findInReactTree(ret, (c: any) => c?.props?.style?.flexDirection === "row")
								if (!row || !Array.isArray(row.props.children) || !tagModule?.default) return ret
								const TagModule = tagModule

								row.props.children.push(
									<TagModule.default
										style={{ marginLeft: 0 }}
										type={0}
										text={tag.text}
										textColor={tag.textColor}
										backgroundColor={tag.backgroundColor}
										verified={tag.verified}
									/>,
								)
							}
						}
					}
					return ret
				}),
			)
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribeHeader()
		unsubscribeDisplay()
		patches.forEach(unpatch => unpatch())
	}
}
