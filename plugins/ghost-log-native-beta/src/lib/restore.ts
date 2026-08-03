import { getCachedLog } from '../ui/state'
import type { DeletedMessage } from '../ui/state'

const log = (...m: any[]) => console.log('[GhostLogNativeBeta]', ...m)

function stores() {
	return revenge.discord.flux.Stores as any
}

// The probe proved _array holds MessageRecord class instances (timestamp is a Date, author is a
// UserRecord, methods like isEdited/toJS). A hand-built plain object crashes the row builder. So we
// build injected messages with Discord's own createMessageRecord, captured from the visuals patch
// (which already locates that module — no second getModules call, avoiding the budget problem).
let createMessageRecord: ((...a: any[]) => any) | undefined

export function setCreateMessageRecord(fn: any) {
	if (typeof fn === 'function') createMessageRecord = fn
}

/** Raw snake_case message, same shape the store normalizes on LOAD_MESSAGES_SUCCESS. */
function buildRaw(entry: DeletedMessage, channelId: string): any {
	return {
		id: entry.id,
		channel_id: channelId,
		content: entry.content,
		author: {
			id: entry.authorId,
			username: entry.authorName,
			global_name: entry.authorName,
			avatar: entry.authorAvatar,
			discriminator: '0',
			public_flags: 0,
		},
		attachments: entry.attachments ?? [],
		embeds: [],
		mentions: [],
		mention_roles: [],
		mention_everyone: false,
		timestamp: new Date(entry.sentAt).toISOString(),
		edited_timestamp: null,
		pinned: false,
		tts: false,
		flags: 0,
		type: 0,
		state: 'SENT',
	}
}

/** Numeric time of a store message regardless of how its timestamp field is represented. */
function timeOf(m: any): number {
	const t = m?.timestamp
	if (t instanceof Date) return t.getTime()
	if (typeof t === 'number') return t
	if (typeof t === 'string') {
		const n = Date.parse(t)
		return Number.isNaN(n) ? 0 : n
	}
	return 0
}

/**
 * Render-layer restore, done correctly. We hook MessageStore.getMessages (the render data source)
 * and merge real MessageRecord instances (built by Discord's createMessageRecord) for our stored
 * deletions into the returned _array. Because they're genuine records, isNewMessageGroup doesn't
 * crash; because getMessages re-reads every draw and re-adds on reconcile, they persist.
 */
export function patchRenderRestore(): () => void {
	const ms = stores().MessageStore
	if (typeof ms?.getMessages !== 'function') {
		console.error('[GhostLogNativeBeta] getMessages not found; render restore disabled')
		return () => {}
	}

	let pendingChannel: any

	const before = revenge.patcher.before(ms, 'getMessages', (args: any[]) => {
		pendingChannel = args?.[0]
		return args
	})

	const after = revenge.patcher.after(ms, 'getMessages', (ret: any) => {
		const channelId = pendingChannel != null ? String(pendingChannel) : undefined
		pendingChannel = undefined
		try {
			if (!channelId || !ret?._array || !Array.isArray(ret._array)) return ret
			if (typeof createMessageRecord !== 'function') return ret

			const entries = getCachedLog().filter(e => e.channelId === channelId)
			if (!entries.length) return ret

			const arr = ret._array
			const present = new Set(arr.map((m: any) => String(m?.id)))

			// _array is time-ordered; find which direction so injected messages slot into their real
			// chronological position instead of landing at the end (the out-of-order bug).
			let dir = 1
			if (arr.length >= 2) dir = timeOf(arr[0]) <= timeOf(arr[arr.length - 1]) ? 1 : -1

			let added = 0
			for (const entry of entries) {
				if (present.has(entry.id)) continue
				try {
					const record = createMessageRecord(buildRaw(entry, channelId))
					if (!record) continue
					record.__vml_deleted = true

					const t = entry.sentAt
					let idx: number
					if (dir === 1) {
						idx = arr.findIndex((m: any) => timeOf(m) > t)
						if (idx === -1) idx = arr.length
					} else {
						idx = arr.findIndex((m: any) => timeOf(m) < t)
						if (idx === -1) idx = arr.length
					}
					arr.splice(idx, 0, record)
					added++
				} catch (error) {
					console.error(`[GhostLogNativeBeta] createMessageRecord failed for ${entry.id}:`, error)
				}
			}
			if (added > 0) log(`render restore merged ${added} into ${channelId}`)
		} catch (error) {
			console.error('[GhostLogNativeBeta] render restore hook failed:', error)
		}
		return ret
	})

	return () => {
		try { before() } catch (e) { /* ignore */ }
		try { after() } catch (e) { /* ignore */ }
	}
}
