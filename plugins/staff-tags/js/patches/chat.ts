import getTag from "../lib/getTag"
import { DEFAULTS, type StaffTagsStorage } from "../index"

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
	const { GuildStore, ChannelStore } = revenge.discord.flux.Stores as any
	// Same reason as everything else here: `revenge.react.ReactNative` is an ESM live binding
	// that's still undefined during preInit, so reading it at module scope captures undefined
	// forever.
	const { ReactNative } = revenge.react

	const unpatches: Array<() => void> = []

	// The message whose tag is being computed, handed from the `before` half to the `after` half.
	// getTagProperties is synchronous and never re-entered, so one slot is enough.
	let pendingMessage: any

	const unsubscribe = getModules(
		withName("getTagProperties"),
		(getTagProperties: any) => {
			// A throw here is not caught by Revenge when the module is already initialized: the
			// callback runs as a bare engine job, and an uncaught error there can close the app.
			// So everything below is guarded (docs/debugging/api-contracts.md).
			try {
				// returnNamespace: true below gives us the wrapper object so we can patch
				// `.default` on the module itself, not the unwrapped function.
				if (typeof getTagProperties?.default !== "function") return

				// `before` + `after`, not `instead`: other plugins `instead`-hook this same
				// function (Clyde Utils does), and two `instead` hooks on one method can recurse
				// until the stack overflows. `before`/`after` compose with any number of them.
				// `after` only receives the return value, so the message is stashed in `before`.
				unpatches.push(
					revenge.patcher.before(getTagProperties, "default", (args: any[]) => {
						pendingMessage = args?.[0]?.message
						// A before-hook must return the args array (porting rule 2).
						return args
					}),
				)

				unpatches.push(
					revenge.patcher.after(getTagProperties, "default", (ret: any) => {
						const message = pendingMessage
						pendingMessage = undefined
						try {
							// A message that already carries a tag (bot, system, automod...) has
							// non-empty tagText, so leaving those alone no longer needs the
							// localised name list.
							if (ret?.tagText || !message?.author) return ret

							const channel = ChannelStore.getChannel(message.channel_id)
							const guild = GuildStore.getGuild(channel?.guild_id)
							const tag = getTag(guild, channel, message.author, !!(jsonStorage.cache ?? DEFAULTS).useRoleColor)
							if (!tag) return ret

							// tag.textColor/backgroundColor are always plain hex strings already
							// (from RawColors or a hardcoded fallback in getTag.ts) -- no need to
							// normalize through a color library (revenge.discord.common.chroma
							// doesn't exist; see the note in getTag.ts).
							// Native rows cannot host an icon component, so the glyph stands in for it.
							const glyph = tag.iconGlyph
							const nativeText = glyph ? (tag.iconOnly ? glyph : `${glyph} ${tag.text}`) : tag.text

							return {
								...ret,
								tagText: nativeText,
								tagTextColor: tag.textColor ? ReactNative.processColor(tag.textColor) : undefined,
								tagBackgroundColor: tag.backgroundColor
									? ReactNative.processColor(tag.backgroundColor)
									: undefined,
								tagVerified: tag.verified,
								tagType: undefined,
							}
						} catch (error) {
							console.error("[StaffTags] chat tag failed:", error)
							// The after-hook's return value is assigned unconditionally, so the
							// original result must survive a failure here.
							return ret
						}
					}),
				)
			} catch (error) {
				console.error("[StaffTags] could not patch getTagProperties:", error)
			}
		},
		{ returnNamespace: true },
	)

	return () => {
		unsubscribe()
		for (const unpatch of unpatches.reverse()) unpatch()
		pendingMessage = undefined
	}
}
