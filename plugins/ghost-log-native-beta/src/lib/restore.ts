import { getCachedLog, getLogVersion } from '../ui/state'
import type { DeletedMessage } from '../ui/state'

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

// A captured deletion never changes once stored, so the MessageRecord built for it is reusable.
// It used to be rebuilt from scratch on every getMessages call -- and getMessages runs several
// times per frame, so the cost was (entries for this channel) x (calls per frame), all of it
// synchronous on the render path. Measured on-device at 341.8: ~15ms per call with 30 orphaned
// entries, scaling linearly, against a 16ms frame budget. Deleting messages in quick succession
// grows that set fast, which is what turned a burst of deletions into an unrecoverable freeze.
// Building each record once collapses the per-call cost to the presence scan below.
const recordCache = new Map<string, any>()
let recordCacheVersion = -1

/**
 * Drop memoized records for entries that have left the log (trim, clear, reload).
 * Takes the whole log, not one channel's slice -- pruning against a slice would evict every
 * other channel's records on each call and defeat the cache entirely.
 */
function syncRecordCache(allEntries: DeletedMessage[], version: number) {
	if (recordCacheVersion === version) return
	recordCacheVersion = version
	if (!recordCache.size) return
	const live = new Set(allEntries.map(e => e.id))
	for (const id of recordCache.keys()) if (!live.has(id)) recordCache.delete(id)
}

/** Build once, reuse thereafter. Returns undefined if the record could not be built. */
function recordFor(entry: DeletedMessage, channelId: string): any {
	const hit = recordCache.get(entry.id)
	if (hit !== undefined) return hit
	try {
		const record = createMessageRecord!(buildRaw(entry, channelId))
		if (!record) return undefined
		record.__vml_deleted = true
		recordCache.set(entry.id, record)
		return record
	} catch (error) {
		console.error(`[GhostLogNativeBeta] createMessageRecord failed for ${entry.id}:`, error)
		return undefined
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
function mergeSorted(source: any[], records: any[]): any[] | undefined {
	if (!records.length) return undefined

	// No ordering information to work from: preserve the old push-to-end behaviour.
	if (!source.length) return source.concat(records)

	const dir = source.length >= 2 && timeOf(source[0]) > timeOf(source[source.length - 1]) ? -1 : 1
	const edgeTs = dir === 1 ? timeOf(source[0]) : timeOf(source[source.length - 1])

	const admitted: any[] = []
	for (const record of records) {
		// Same rule as before: a record with no usable timestamp can only go on the end, and one
		// that falls outside the currently-loaded window is skipped rather than jammed against the
		// edge -- it self-corrects once pagination reaches back past it.
		if (!(record?.timestamp instanceof Date)) {
			admitted.push(record)
			continue
		}
		const ts = timeOf(record)
		if (dir === 1 ? ts < edgeTs : ts > edgeTs) continue
		admitted.push(record)
	}
	if (!admitted.length) return undefined

	// Single linear merge instead of one splice per record: splicing inserted each record with an
	// O(loaded) scan plus an O(loaded) memmove, so a channel with many logged deletions cost
	// O(missing x loaded) on every getMessages call.
	admitted.sort((a, b) => (dir === 1 ? timeOf(a) - timeOf(b) : timeOf(b) - timeOf(a)))

	const out: any[] = []
	let i = 0
	let j = 0
	while (i < source.length && j < admitted.length) {
		const st = timeOf(source[i])
		const at = timeOf(admitted[j])
		// `<=` keeps an existing message ahead of an injected one at an equal timestamp, matching
		// the old insert loop, which walked back only while the neighbour was strictly later.
		if (dir === 1 ? st <= at : st >= at) out.push(source[i++])
		else out.push(admitted[j++])
	}
	while (i < source.length) out.push(source[i++])
	while (j < admitted.length) out.push(admitted[j++])
	return out
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
		embeds: entry.embeds ?? [],
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

			const all = getCachedLog()
			syncRecordCache(all, getLogVersion())

			const entries = all.filter(e => e.channelId === channelId)
			if (!entries.length) return ret

			const present = new Set(ret._array.map((m: any) => String(m?.id)))
			const missing = entries.filter(e => !present.has(e.id))
			if (!missing.length) return ret

			const records: any[] = []
			for (const entry of missing) {
				const record = recordFor(entry, channelId)
				if (record) records.push(record)
			}

			// _array is the store's own live backing array, not a copy handed out per call -- splicing
			// into it directly desyncs whatever id/index bookkeeping the real MESSAGE_CREATE/UPDATE
			// reducers keep alongside it (this is what crashed active conversations: a real-time
			// dispatch landing on indices our splice had silently shifted). Build the merge on a
			// throwaway copy and hand back a shallow clone of the record instead, so the store's own
			// array is never touched.
			const merged = mergeSorted(ret._array, records)
			if (merged) {
				// Deliberately not logged per call: this hook runs several times per frame, and during
				// a deletion burst the console bridge was itself a measurable share of the cost.
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
