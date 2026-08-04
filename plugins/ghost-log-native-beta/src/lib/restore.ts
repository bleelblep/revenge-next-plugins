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
 * _array is chronologically ordered, but direction isn't fixed -- some views (e.g. jump-to-message)
 * hand back newest-first. Detect direction from the array's own two ends rather than assuming
 * oldest-first, then splice into the matching sorted position instead of pushing onto the end.
 *
 * On a cold or partially-paginated load, `array` only holds a recent window. An entry older (in
 * insertion order) than everything currently loaded has no real neighbor yet -- Discord just hasn't
 * paginated back far enough to know what's actually next to it -- so inserting it at the edge shoves
 * it in front of messages it doesn't belong next to until more history streams in. This hook reruns
 * on every getMessages call against a fresh copy, so skipping here just means it self-corrects once
 * the loaded window actually reaches back past the entry's timestamp, rather than guessing wrong now.
 */
function insertSorted(array: any[], record: any): boolean {
	if (!(record?.timestamp instanceof Date) || !array.length) {
		array.push(record)
		return true
	}
	const ts = timeOf(record)
	const dir = array.length >= 2 && timeOf(array[0]) > timeOf(array[array.length - 1]) ? -1 : 1
	const edgeTs = dir === 1 ? timeOf(array[0]) : timeOf(array[array.length - 1])
	if (dir === 1 ? ts < edgeTs : ts > edgeTs) return false

	let i = array.length
	while (i > 0) {
		const prevTs = timeOf(array[i - 1])
		if (dir === 1 ? prevTs <= ts : prevTs >= ts) break
		i--
	}
	array.splice(i, 0, record)
	return true
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

			const present = new Set(ret._array.map((m: any) => String(m?.id)))
			const missing = entries.filter(e => !present.has(e.id))
			if (!missing.length) return ret

			// _array is the store's own live backing array, not a copy handed out per call -- splicing
			// into it directly desyncs whatever id/index bookkeeping the real MESSAGE_CREATE/UPDATE
			// reducers keep alongside it (this is what crashed active conversations: a real-time
			// dispatch landing on indices our splice had silently shifted). Build the merge on a
			// throwaway copy and hand back a shallow clone of the record instead, so the store's own
			// array is never touched.
			const merged = ret._array.slice()
			let added = 0
			for (const entry of missing) {
				try {
					const record = createMessageRecord(buildRaw(entry, channelId))
					if (!record) continue
					record.__vml_deleted = true
					if (insertSorted(merged, record)) added++
				} catch (error) {
					console.error(`[GhostLogNativeBeta] createMessageRecord failed for ${entry.id}:`, error)
				}
			}
			if (added > 0) {
				log(`render restore merged ${added} into ${channelId}`)
				const clone = Object.assign(Object.create(Object.getPrototypeOf(ret)), ret)
				clone._array = merged
				return clone
			}
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
