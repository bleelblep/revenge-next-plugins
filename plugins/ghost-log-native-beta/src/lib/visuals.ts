import { setCreateMessageRecord } from './restore'
import type { GhostLogSettings } from '../types'

const log = (...m: any[]) => console.log('[GhostLogNativeBeta]', ...m)

function stores() {
	return revenge.discord.flux.Stores as any
}

/**
 * Ported from stable Ghost Log's visuals.ts. Same technique: convert MESSAGE_DELETE into a
 * MESSAGE_UPDATE carrying a __vml_deleted flag, then style flagged rows via RowManager.
 * Session-only — flagged messages disappear on reload. Persistent restore builds on top of this.
 */
function patchDispatcher(
	getSettings: () => GhostLogSettings,
	patches: (() => void)[],
	onDelete?: (channelId: string, messageId: string) => void,
) {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	const unsub = getModules(withProps('dispatch', 'subscribe'), (mod: any) => {
		const host = typeof mod?.dispatch === 'function' ? mod : mod?.default
		if (typeof host?.dispatch !== 'function' || typeof host?.subscribe !== 'function') return

		patches.push(
			revenge.patcher.before(host, 'dispatch', (args: any[]) => {
				const [event] = args
				try {
					if (event?.type !== 'MESSAGE_DELETE') return args
					if (event.__vml_cleanup) return args

					// This hook provably sees the raw MESSAGE_DELETE (it converts it). The flux
					// subscriber does NOT, because the conversion eats the event downstream. So the
					// log capture is driven from here.
					try {
						onDelete?.(String(event.channelId), String(event.id))
					} catch (error) {
						console.error('[GhostLogNativeBeta] capture from dispatcher hook failed:', error)
					}

					const settings = getSettings()
					const s = stores()
					const message = s.MessageStore?.getMessage?.(event.channelId, event.id)
					if (!message) return args
					if (message.state === 'SEND_FAILED') return args

					const currentUserId = s.UserStore?.getCurrentUser?.()?.id
					if (!settings.countOwnMessages && currentUserId && message.author?.id === currentUserId) {
						return args
					}

					if (settings.deleteStyle === 'off') return args

					const msgData: any = {
						id: message.id,
						channel_id: message.channel_id,
						content: message.content,
						author: message.author ? { ...message.author } : undefined,
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
						state: message.state ?? 'SENT',
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

					log('Converted delete to update for', message.id)
					return [
						{
							type: 'MESSAGE_UPDATE',
							message: msgData,
						},
					]
				} catch (error) {
					console.error('[GhostLogNativeBeta] Dispatcher hook failed:', error)
				}
				return args
			}),
		)
	})

	return unsub
}

function patchRowManager(getSettings: () => GhostLogSettings, patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const unsub = getModules(withName('RowManager'), (RowManager: any) => {
		if (!RowManager?.prototype?.generate) {
			console.error('[GhostLogNativeBeta] RowManager.prototype.generate not found')
			return
		}

		let pendingRow: any

		patches.push(
			revenge.patcher.before(RowManager.prototype, 'generate', (args: any[]) => {
				pendingRow = args?.[0]
				return args
			}),
		)

		patches.push(
			revenge.patcher.after(RowManager.prototype, 'generate', (ret: any) => {
				const data = pendingRow
				pendingRow = undefined

				try {
					if (data?.rowType !== 1) return ret
					if (!data?.message?.__vml_deleted) return ret

					const settings = getSettings()

					if (settings.deleteStyle === 'overlay') {
						ret.message = ret.message ?? {}
						ret.message.edited = 'deleted'
						ret.backgroundHighlight = ret.backgroundHighlight ?? {}
						const { processColor } = revenge.react.ReactNative
						if (processColor) {
							ret.backgroundHighlight.backgroundColor = processColor('#da373c22')
							ret.backgroundHighlight.gutterColor = processColor('#da373cff')
						}
					} else if (settings.deleteStyle === 'text') {
						ret.message = ret.message ?? {}
						ret.message.edited = 'deleted'
						if (ret.message.colorString === undefined) {
							ret.message.colorString = '#f04747'
						}
					}
				} catch (error) {
					console.error('[GhostLogNativeBeta] RowManager hook failed:', error)
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
		withProps('createMessageRecord', 'updateMessageRecord'),
		(mod: any) => {
			const utils = typeof mod?.createMessageRecord === 'function' ? mod : mod?.default
			if (typeof utils?.createMessageRecord !== 'function') return

			// Hand Discord's record builder to the render-restore layer so injected messages are real
			// MessageRecords (methods + Date timestamps), not plain objects that crash the row builder.
			setCreateMessageRecord(utils.createMessageRecord)

			let pendingMessage: any

			patches.push(
				revenge.patcher.before(utils, 'createMessageRecord', (args: any[]) => {
					pendingMessage = args?.[0]
					return args
				}),
			)

			patches.push(
				revenge.patcher.after(utils, 'createMessageRecord', (ret: any) => {
					const message = pendingMessage
					pendingMessage = undefined
					try {
						if (ret) ret.__vml_deleted = message?.__vml_deleted
					} catch (error) {
						console.error('[GhostLogNativeBeta] createMessageRecord hook failed:', error)
					}
					return ret
				}),
			)

			if (typeof utils.updateMessageRecord !== 'function') return

			patches.push(
				revenge.patcher.instead(utils, 'updateMessageRecord', function (
					this: any,
					[oldRecord, newRecord]: any[],
					original: any,
				) {
					try {
						if (newRecord?.__vml_deleted) {
							return utils.createMessageRecord(newRecord, oldRecord?.reactions)
						}
					} catch (error) {
						console.error('[GhostLogNativeBeta] updateMessageRecord hook failed:', error)
					}
					if (typeof original !== 'function') return oldRecord
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

	const unsub = getModules(withName('MessageRecord'), (MessageRecord: any) => {
		if (typeof MessageRecord?.default !== 'function') {
			console.error('[GhostLogNativeBeta] MessageRecord.default not found')
			return
		}

		let pendingDeleted = false

		patches.push(
			revenge.patcher.before(MessageRecord, 'default', (args: any[]) => {
				pendingDeleted = !!args?.[0]?.__vml_deleted
				return args
			}),
		)

		patches.push(
			revenge.patcher.after(MessageRecord, 'default', (ret: any) => {
				const deleted = pendingDeleted
				pendingDeleted = false
				try {
					if (ret) ret.__vml_deleted = deleted
				} catch (error) {
					console.error('[GhostLogNativeBeta] MessageRecord constructor hook failed:', error)
				}
				return ret
			}),
		)
	})

	return unsub
}

export function patchVisuals(
	getSettings: () => GhostLogSettings,
	onDelete?: (channelId: string, messageId: string) => void,
): () => void {
	const patches: (() => void)[] = []

	const unsubs = [
		patchDispatcher(getSettings, patches, onDelete),
		patchRowManager(getSettings, patches),
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
								type: 'MESSAGE_DELETE',
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
