import { setCreateMessageRecord } from './restore'
import { getCachedLog } from '../ui/state'
import { getEditRecord } from './edits'
import type { GhostLogSettings } from '../types'

const log = (...m: any[]) => console.log('[GhostLogNativeBeta]', ...m)

function stores() {
	return revenge.discord.flux.Stores as any
}

/**
 * A getModules callback runs from Revenge's own scheduler, outside every try/catch in this plugin.
 * Anything that throws in there -- a patcher assignment onto a read-only export, a module whose
 * shape changed in a new Discord build -- is an uncaught exception, which takes the whole app down
 * rather than just disabling a feature. Every callback goes through this.
 */
function guarded<A extends any[]>(label: string, fn: (...args: A) => void) {
	return (...args: A) => {
		try {
			fn(...args)
		} catch (error) {
			console.error(`[GhostLogNativeBeta] ${label} failed; feature disabled for this session:`, error)
		}
	}
}

/**
 * Mentioned users in the shape a MESSAGE_UPDATE carries. A MessageRecord keeps `mentions` as user id
 * strings, but a real MESSAGE_UPDATE carries user objects, and Discord adds each one to its user
 * store and its native user-search worker. Passing the ids through made users with no id or
 * username, and the worker's parser (`UserSearchTransformedUser`, which requires both) threw a
 * NullPointerException that took the app down whenever a deleted message mentioned someone
 * (2026-10-03). Ids are resolved through UserStore; anything still missing an id or username is
 * dropped.
 */
export function mentionUsers(mentions: unknown): any[] {
	if (!Array.isArray(mentions)) return []
	const UserStore = stores().UserStore
	return mentions
		.map(m => (typeof m === 'string' ? UserStore?.getUser?.(m) : m))
		.filter(user => user?.id && user?.username)
}

/** A message's author as a user the stores accept, or undefined when none has an id and username. */
function usableAuthor(author: any): any | undefined {
	if (author?.id && author?.username) return author
	const user = author?.id ? stores().UserStore?.getUser?.(author.id) : undefined
	return user?.id && user?.username ? user : undefined
}

/**
 * Ported from stable Ghost Log's visuals.ts. Same technique: convert MESSAGE_DELETE into a
 * MESSAGE_UPDATE carrying a __vml_deleted flag, then style flagged rows via RowManager.
 *
 * Hooks the one real dispatcher Revenge already resolved. This used to sweep up to 10 modules that
 * merely had `dispatch` and `subscribe` and patch every one of them, which on a new Discord build is
 * an unknown set of objects -- and any with a non-writable `dispatch` throws while being patched.
 *
 * Not `onFluxEventDispatched`: Revenge chooses those patches by the ORIGINAL event type, so
 * converting there would hand every other plugin's MESSAGE_DELETE patch an update event.
 */
function patchDispatcher(
	getSettings: () => GhostLogSettings,
	patches: (() => void)[],
	onDelete?: (channelId: string, messageId: string) => void,
) {
	const Dispatcher = revenge.discord.common.flux.Dispatcher as any
	if (typeof Dispatcher?.dispatch !== 'function') {
		console.error('[GhostLogNativeBeta] Flux dispatcher not found; deleted messages will not stay visible')
		return () => {}
	}

	patches.push(
		revenge.patcher.before(Dispatcher, 'dispatch', (args: any[]) => {
			const [event] = args
			try {
				if (event?.type !== 'MESSAGE_DELETE') return args
				if (event.__vml_cleanup) return args

				// This hook sees the raw MESSAGE_DELETE before Revenge's flux patches do. Once it
				// converts the event, the MESSAGE_DELETE subscriber in index.ts never runs for it, so
				// the log capture has to happen here.
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

				if (settings.ignoreBots && message.author?.bot) return args

				if (settings.deleteStyle === 'off') return args

				// An update with an author the user search can't parse crashes the app (see
				// mentionUsers); letting the delete through only loses the styling.
				const author = usableAuthor(message.author)
				if (!author) return args

				const msgData: any = {
					id: message.id,
					channel_id: message.channel_id,
					content: message.content,
					// Not a spread: UserRecord stores its fields as non-enumerable getters (same
					// class-instance pattern as MessageRecord itself), so `{ ...message.author }`
					// silently produces an empty object for any cached *other* user's record --
					// missing id/username -- which crashed createMessageRecord below on every
					// non-self delete. The record is immutable and only read from here, so handing
					// the reference straight through is safe.
					author,
					attachments: message.attachments ? [...message.attachments] : [],
					embeds: message.embeds ?? [],
					mentions: mentionUsers(message.mentions),
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
					// Rebuilt by field name rather than passed as the record: its `mentions` are id
					// strings too. Left out when its author is unusable; the reference alone still
					// links the reply.
					const ref = message.referenced_message
					const refAuthor = usableAuthor(ref.author)
					if (refAuthor) {
						msgData.referenced_message = {
							id: ref.id,
							channel_id: ref.channel_id,
							content: ref.content ?? '',
							author: refAuthor,
							attachments: ref.attachments ? [...ref.attachments] : [],
							embeds: ref.embeds ?? [],
							mentions: mentionUsers(ref.mentions),
							mention_roles: ref.mention_roles ?? [],
							mention_everyone: ref.mention_everyone ?? false,
							timestamp: ref.timestamp,
							edited_timestamp: ref.edited_timestamp,
							flags: ref.flags ?? 0,
							type: ref.type ?? 0,
						}
					}
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

	return () => {}
}

const clipVersion = (text: string) => {
	const flat = text.replace(/\s+/g, ' ').trim()
	if (!flat) return '(no text)'
	return flat.length > 300 ? `${flat.slice(0, 299)}…` : flat
}

/**
 * Earlier versions of an edited message, as muted `subtext` lines (Discord's `-#` small text)
 * above the current text, oldest first.
 *
 * `content` here is Discord's per-record parse cache (docs: discord-row-content-is-parse-cache), so
 * it is never changed in place: the row gets a new array that holds the cached nodes after ours.
 */
function applyEditHistory(ret: any, message: any, settings: GhostLogSettings) {
	if (!settings.showEditHistory || !message?.id) return
	const record = getEditRecord(String(message.id))
	if (!record?.versions?.length) return
	const content = ret?.message?.content
	if (!Array.isArray(content)) return
	const trail = record.versions.map(version => ({
		type: 'subtext',
		content: [{ type: 'text', content: clipVersion(version.content) }],
	}))
	ret.message.content = [...trail, ...content]
}

function patchRowManager(getSettings: () => GhostLogSettings, patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	// `max` defaults to 1, and the count is spent even when the callback bails out early -- so the
	// plain call patched only the FIRST RowManager and stopped. There is more than one RowManager
	// class in this app (screenshot-redactor raises max for exactly this reason), which meant
	// deleted-message styling silently never applied wherever a second one rendered. Two module
	// entries can also resolve to the same class, so dedupe by prototype or the hooks install twice.
	const seenRowManagers = new Set<any>()

	const unsub = getModules(
		withName('RowManager'),
		guarded('RowManager patch', (RowManager: any) => {
			if (!RowManager?.prototype?.generate) {
				console.error('[GhostLogNativeBeta] RowManager.prototype.generate not found')
				return
			}
			if (seenRowManagers.has(RowManager.prototype)) return
			seenRowManagers.add(RowManager.prototype)

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
						const settings = getSettings()

						try {
							applyEditHistory(ret, data.message, settings)
						} catch (error) {
							console.error('[GhostLogNativeBeta] edit history row failed:', error)
						}

						if (!data?.message?.__vml_deleted) return ret

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
		}),
		{ max: 10 },
	)

	return unsub
}

function patchMessageRecordUtils(patches: (() => void)[]) {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	const seenUtils = new Set<any>()

	const unsub = getModules(
		withProps('createMessageRecord', 'updateMessageRecord'),
		guarded('createMessageRecord patch', (mod: any) => {
			const utils = typeof mod?.createMessageRecord === 'function' ? mod : mod?.default
			if (typeof utils?.createMessageRecord !== 'function') return
			// Same `max` trap as RowManager above: a single default slot, spent even on a callback
			// that returns early, so one junk match meant these hooks never installed at all.
			if (seenUtils.has(utils)) return
			seenUtils.add(utils)

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
		}),
		{ max: 10 },
	)

	return unsub
}

export function patchVisuals(
	getSettings: () => GhostLogSettings,
	onDelete?: (channelId: string, messageId: string) => void,
): () => void {
	// A module finder callback can land AFTER the plugin has been disabled -- the subscription is
	// asynchronous and the unsubscribes below only stop future matches, they cannot recall one that
	// is already running. Anything pushed after teardown used to sit in this array forever, leaving
	// a live hook on the chat render path belonging to a plugin the user had switched off. So the
	// array knows whether teardown has happened, and unpatches immediately if it has.
	let stopped = false
	const applied: (() => void)[] = []
	const patches = {
		push(unpatch: () => void) {
			if (stopped) {
				try { unpatch() } catch (e) { /* ignore */ }
				return
			}
			applied.push(unpatch)
		},
	} as unknown as (() => void)[]

	const unsubs: (() => void)[] = []
	for (const install of [
		() => patchDispatcher(getSettings, patches, onDelete),
		() => patchRowManager(getSettings, patches),
		() => patchMessageRecordUtils(patches),
		// No hook on the MessageRecord class itself. Its lookup never matched until 0.5.0-beta14
		// (withName returns the class, so `.default` was always missing), and once beta14 made it
		// install by wrapping the constructor, message timestamps broke. createMessageRecord and
		// updateMessageRecord above already carry the deleted flag, so it isn't needed.
	]) {
		// One failing patch must not stop the others from installing, or skip cleanup for those
		// that did.
		try {
			unsubs.push(install())
		} catch (error) {
			console.error('[GhostLogNativeBeta] visual patch failed to install:', error)
		}
	}

	return () => {
		stopped = true
		for (const unpatch of applied) {
			try { unpatch() } catch (e) { /* ignore */ }
		}
		applied.length = 0
		for (const unsub of unsubs) {
			try { unsub() } catch (e) { /* ignore */ }
		}
		// `MessageStore._channelMessages` does NOT exist on 343.11 -- a devtools probe returned
		// `typeof === "undefined"` for it -- so this used to be a `for...in` over undefined, which is
		// legal, iterates nothing, and silently left every flagged message flagged on disable/reload.
		// getMessages is the accessor that actually exists, so walk the channels we know we touched
		// (the ones in our own log) and ask the store for each.
		try {
			const ms = stores().MessageStore
			const dispatcher = revenge.discord.common.flux.Dispatcher as any
			if (typeof ms?.getMessages === 'function' && typeof dispatcher?.dispatch === 'function') {
				const channelIds = new Set<string>()
				for (const entry of getCachedLog()) if (entry.channelId) channelIds.add(String(entry.channelId))
				const selected = stores().SelectedChannelStore?.getChannelId?.()
				if (selected) channelIds.add(String(selected))

				for (const channelId of channelIds) {
					try {
						const array = ms.getMessages(channelId)?._array
						if (!Array.isArray(array)) continue
						// Snapshot first: each dispatch runs the store's reducers, which mutate the very
						// array being walked.
						for (const msg of [...array]) {
							if (!msg?.__vml_deleted) continue
							dispatcher.dispatch({
								type: 'MESSAGE_DELETE',
								id: msg.id,
								channelId: msg.channel_id ?? channelId,
								__vml_cleanup: true,
							})
						}
					} catch (_) { /* one bad channel must not abort the sweep */ }
				}
			}
		} catch (_) { /* ignore */ }
	}
}
