import { DEFAULTS } from "../defaults"
import type { GhostLogStorage } from "../types"

const log = (...m: any[]) => console.log("[GhostLog]", ...m)

function stores() {
	return revenge.discord.flux.Stores as any
}

/**
 * Hooks FluxDispatcher.dispatch to convert MESSAGE_DELETE events into MESSAGE_UPDATE
 * events carrying a __vml_deleted flag. The flag is then used by the RowManager patch
 * to apply visual styling. This is the same technique redstonekasi's message-logger uses.
 */
function patchDispatcher(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>, patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	const unsub = getModules(withProps("dispatch", "subscribe"), (mod: any) => {
		// The dispatcher is usually on the module's default export, not on the exports
		// object itself. See docs/porting-rules.md rule 3.
		const host = typeof mod?.dispatch === "function" ? mod : mod?.default
		if (typeof host?.dispatch !== "function" || typeof host?.subscribe !== "function") return

		patches.push(
			revenge.patcher.before(host, "dispatch", (args: any[]) => {
				const [event] = args
				try {
					if (event?.type !== "MESSAGE_DELETE") return args
					if (event.__vml_cleanup) return args

					const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
					const s = stores()
					const message = s.MessageStore?.getMessage?.(event.channelId, event.id)
					if (!message) return args
					if (message.state === "SEND_FAILED") return args

					const currentUserId = s.UserStore?.getCurrentUser?.()?.id
					if (!settings.countOwnMessages && currentUserId && message.author?.id === currentUserId) {
						return args
					}

					if (settings.ignoreBots && message.author?.bot) return args
					if (settings.ignoredUserIds?.includes(message.author?.id)) return args
					if (settings.ignoredChannelIds?.includes(event.channelId)) return args
					const channel = s.ChannelStore?.getChannel?.(event.channelId)
					if (channel?.guild_id && settings.ignoredGuildIds?.includes(channel.guild_id)) return args

					if (settings.deleteStyle === "off") return args

					const msgData: any = {
						id: message.id,
						channel_id: message.channel_id,
						content: message.content,
						// Not a spread: UserRecord stores its fields as non-enumerable getters (same
						// class-instance pattern as MessageRecord itself), so `{ ...message.author }`
						// silently produces an empty object for any cached *other* user's record --
						// missing id/username -- which crashed createMessageRecord on every non-self
						// delete. The record is immutable and only read from here, so handing the
						// reference straight through is safe.
						author: message.author,
						attachments: message.attachments ? [...message.attachments] : [],
						embeds: message.embeds ?? [],
						mentions: message.mentions ?? [],
						mention_roles: message.mention_roles ?? [],
						mention_everyone: message.mention_everyone ?? false,
						timestamp: message.timestamp,
						edited_timestamp: message.edited_timestamp,
						pinned: message.pinned ?? false,
						tts: message.tts ?? false,
						flags: message.flags ?? 0,
						type: message.type ?? 0,
						state: message.state ?? "SENT",
						__vml_deleted: true,
					}

					if (message.referenced_message) {
						msgData.referenced_message = { ...message.referenced_message }
						msgData.message_reference = {
							channel_id: message.referenced_message.channel_id,
							message_id: message.referenced_message.id,
							guild_id: message.messageReference?.guild_id,
						}
					}

					log("Converted delete to update for", message.id)
					return [
						{
							type: "MESSAGE_UPDATE",
							message: msgData,
						},
					]
				} catch (error) {
					console.error("[GhostLog] Dispatcher hook failed:", error)
				}
				// A before-hook must return the args array on every path, outside the try --
				// returning nothing sets args to undefined for every later hook on dispatch.
				// See docs/porting-rules.md rule 2.
				return args
			}),
		)
	})

	return unsub
}

function patchRowManager(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>, patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const unsub = getModules(withName("RowManager"), (RowManager: any) => {
		if (!RowManager?.prototype?.generate) {
			console.error("[GhostLog] RowManager.prototype.generate not found")
			return
		}

		// before+after, deliberately NOT instead: custom-timestamps owns the only instead
		// hook allowed on RowManager.generate (two instead hooks on one method recurse
		// forever in this patcher). In this patcher an after hook only receives the return
		// value -- the row data has to be stashed by a before hook and consumed here.
		// generate is never re-entered, so a single pending slot is safe.
		// See docs/porting-rules.md rule 2.
		let pendingRow: any

		patches.push(
			revenge.patcher.before(RowManager.prototype, "generate", (args: any[]) => {
				pendingRow = args?.[0]
				return args
			}),
		)

		// This runs on the chat render path -- anything escaping here takes down the whole
		// ChatView, so the body is guarded and `ret` is returned on every path (the
		// patcher assigns the hook's return value unconditionally).
		patches.push(
			revenge.patcher.after(RowManager.prototype, "generate", (ret: any) => {
				const data = pendingRow
				pendingRow = undefined

				try {
					if (data?.rowType !== 1) return ret
					if (!data?.message?.__vml_deleted) return ret

					const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }

					if (settings.deleteStyle === "overlay") {
						ret.message = ret.message ?? {}
						ret.message.edited = "deleted"
						ret.backgroundHighlight = ret.backgroundHighlight ?? {}
						const { processColor } = revenge.react.ReactNative
						if (processColor) {
							ret.backgroundHighlight.backgroundColor = processColor("#da373c22")
							ret.backgroundHighlight.gutterColor = processColor("#da373cff")
						}
					} else if (settings.deleteStyle === "text") {
						ret.message = ret.message ?? {}
						ret.message.edited = "deleted"
						if (ret.message.colorString === undefined) {
							ret.message.colorString = "#f04747"
						}
					}
				} catch (error) {
					console.error("[GhostLog] RowManager hook failed:", error)
				}

				return ret
			}),
		)
	})

	return unsub
}

function patchMessageRecordUtils(patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	const unsub = getModules(
		withProps("createMessageRecord", "updateMessageRecord"),
		(mod: any) => {
			// Exports are usually on default, not on the exports object. See
			// docs/porting-rules.md rule 3.
			const utils = typeof mod?.createMessageRecord === "function" ? mod : mod?.default
			if (typeof utils?.createMessageRecord !== "function") return

			// Same before/after stash as RowManager: the after hook only sees the created
			// record, so the source message comes through the before hook.
			let pendingMessage: any

			patches.push(
				revenge.patcher.before(utils, "createMessageRecord", (args: any[]) => {
					pendingMessage = args?.[0]
					return args
				}),
			)

			patches.push(
				revenge.patcher.after(utils, "createMessageRecord", (ret: any) => {
					const message = pendingMessage
					pendingMessage = undefined
					try {
						if (ret) ret.__vml_deleted = message?.__vml_deleted
					} catch (error) {
						console.error("[GhostLog] createMessageRecord hook failed:", error)
					}
					return ret
				}),
			)

			if (typeof utils.updateMessageRecord !== "function") return

			patches.push(
				revenge.patcher.instead(utils, "updateMessageRecord", function (
					this: any,
					[oldRecord, newRecord]: any[],
					original: any,
				) {
					try {
						if (newRecord?.__vml_deleted) {
							return utils.createMessageRecord(newRecord, oldRecord?.reactions)
						}
					} catch (error) {
						console.error("[GhostLog] updateMessageRecord hook failed:", error)
					}
					// A getModules match can fire on partially-populated exports -- never
					// assume the captured original is callable. See porting-rules.md rule 2.
					if (typeof original !== "function") return oldRecord
					return Reflect.apply(original, this, [oldRecord, newRecord])
				}),
			)
		},
	)

	return unsub
}

function patchMessageRecord(patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const unsub = getModules(withName("MessageRecord"), (MessageRecord: any) => {
		if (typeof MessageRecord?.default !== "function") {
			console.error("[GhostLog] MessageRecord.default not found")
			return
		}

		// Constructor version of the stash above: `before` sees the props, `after` only
		// sees the constructed instance and must return it.
		let pendingDeleted = false

		patches.push(
			revenge.patcher.before(MessageRecord, "default", (args: any[]) => {
				pendingDeleted = !!args?.[0]?.__vml_deleted
				return args
			}),
		)

		patches.push(
			revenge.patcher.after(MessageRecord, "default", (ret: any) => {
				const deleted = pendingDeleted
				pendingDeleted = false
				try {
					if (ret) ret.__vml_deleted = deleted
				} catch (error) {
					console.error("[GhostLog] MessageRecord constructor hook failed:", error)
				}
				return ret
			}),
		)
	})

	return unsub
}

export function patchVisuals(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>): () => void {
	const patches: (() => void)[] = []

	const unsubs = [
		patchDispatcher(jsonStorage, patches),
		patchRowManager(jsonStorage, patches),
		patchMessageRecordUtils(patches),
		patchMessageRecord(patches),
	]

	return () => {
		for (const unpatch of patches) {
			try { unpatch() } catch (e) { /* ignore */ }
		}
		for (const unsub of unsubs) {
			try { unsub() } catch (e) { /* ignore */ }
		}
		for (const channelId in stores().MessageStore?._channelMessages) {
			try {
				const channel = stores().MessageStore._channelMessages[channelId]
				if (channel?._array) {
					for (const msg of channel._array) {
						if (msg?.__vml_deleted) {
							revenge.discord.common.flux.Dispatcher?.dispatch?.({
								type: "MESSAGE_DELETE",
								id: msg.id,
								channelId: msg.channel_id,
								__vml_cleanup: true,
							})
						}
					}
				}
			} catch (_) { /* ignore */ }
		}
	}
}
