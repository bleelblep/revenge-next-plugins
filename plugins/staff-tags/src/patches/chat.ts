import getTag from "../lib/getTag"
import type { StaffTagsStorage } from "../index"

// Resolved inside the exported function, not at module top level: Revenge Next's preInit
// phase runs before Discord's module registry is populated, and a module finder lookup run
// too early can permanently cache a false "not found" result. This function only runs when
// called from start(), well after boot.
//
// getModules, not lookupModule: confirmed on-device that even from inside start(),
// getTagProperties isn't loaded yet on a cold app restart (it's part of the chat UI, which
// only initializes once the chat screen actually renders) -- lookupModule gives up
// immediately and permanently caches that as "not found". getModules subscribes and calls
// back whenever the module actually loads, matching the pattern Palm's own confirmed-working
// hide-blocked-messages plugin uses for its one module lookup.
export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters
	const { GuildStore, ChannelStore } = revenge.discord.flux.Stores
	// Same reason as everything else here: `revenge.react.ReactNative` is an ESM live binding
	// that's still undefined during preInit, so reading it at module scope captures undefined
	// forever.
	const { ReactNative } = revenge.react

	let unpatch: (() => void) | undefined

	const unsubscribe = getModules<any>(
		withName("getTagProperties"),
		getTagProperties => {
			// returnNamespace: true above gives us the wrapper object so we can patch
			// `.default` on the module itself, not the unwrapped function.
			if (!getTagProperties?.default) return

			// instead, not after: after's hook only receives the return value, not the
			// original arguments (confirmed from revenge-bundle-next's own patcher source --
			// this was the actual bug behind an "iterator method is not callable" crash from
			// destructuring a result object as if it were an args array). instead gives us
			// both the args and a way to get the real result via `original(...args)`.
			unpatch = revenge.patcher.instead(getTagProperties, "default", (args: any[], original: any) => {
				// Confirmed on-device crash elsewhere (tag.tsx): "undefined is not a function"
				// when the captured original wasn't actually a function yet at patch time
				// (a getModules match on partially-populated exports). Never assume it's callable.
				if (typeof original !== "function") return undefined
				const ret = original(...args)
				const [{ message }] = args
				// A message that already carries a tag (bot, system, automod...) has non-empty
				// tagText, so leaving those alone no longer needs the localised name list.
				if (!ret?.tagText && message?.author) {
					const channel = ChannelStore.getChannel(message.channel_id)
					const guild = GuildStore.getGuild(channel?.guild_id)

					const tag = getTag(guild, channel, message.author, !!jsonStorage.cache.useRoleColor)

					if (tag) {
						// tag.textColor/backgroundColor are always plain hex strings already
						// (from RawColors or a hardcoded fallback in getTag.ts) -- no need to
						// normalize through a color library (revenge.discord.common.chroma
						// doesn't exist; see the note in getTag.ts).
						return {
							...ret,
							tagText: tag.text,
							tagTextColor: tag.textColor ? ReactNative.processColor(tag.textColor) : undefined,
							tagBackgroundColor: tag.backgroundColor
								? ReactNative.processColor(tag.backgroundColor)
								: undefined,
							tagVerified: tag.verified,
							tagType: undefined,
						}
					}
				}
				return ret
			})
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribe()
		unpatch?.()
	}
}
