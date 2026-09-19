import { getCachedLog, getLogVersion, rehydrateChannel } from '../ui/state'
import type { DeletedMessage } from '../ui/state'
import type { GhostLogSettings } from '../types'

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
		// `edgeTs` is the OLDEST loaded timestamp in both directions (source[0] when oldest-first,
		// source[last] when newest-first), so the skip test is `ts < edgeTs` either way. It used to
		// read `ts > edgeTs` for the newest-first case, which inverted the rule: it dropped every
		// record inside the loaded window and admitted only the ones that fall outside it. That made
		// jump-to-message views restore exactly the wrong set.
		if (ts < edgeTs) continue
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
		// These were hardcoded empty, which is why a bulk-deleted message came back stripped: no
		// mentions (they rendered as raw <@id> markup), no reply context, no edited marker, and
		// every message forced to type 0 regardless of what it actually was.
		mentions: entry.mentions ?? [],
		mention_roles: entry.mentionRoles ?? [],
		mention_everyone: entry.mentionEveryone ?? false,
		timestamp: new Date(entry.sentAt).toISOString(),
		edited_timestamp: entry.editedAt ? new Date(entry.editedAt).toISOString() : null,
		pinned: entry.pinned ?? false,
		tts: entry.tts ?? false,
		flags: entry.flags ?? 0,
		type: entry.messageType ?? 0,
		state: 'SENT',
		...(entry.referencedMessage
			? {
					message_reference: {
						channel_id: entry.referencedMessage.channelId,
						message_id: entry.referencedMessage.id,
						guild_id: entry.guildId,
					},
					referenced_message: {
						id: entry.referencedMessage.id,
						channel_id: entry.referencedMessage.channelId,
						content: entry.referencedMessage.content ?? '',
						author: entry.referencedMessage.author ?? {
							id: '0',
							username: 'Unknown',
							discriminator: '0',
						},
						attachments: [],
						embeds: [],
						mentions: [],
						mention_roles: [],
						timestamp: new Date(entry.sentAt).toISOString(),
						type: 0,
					},
			  }
			: {}),
	}
}

/**
 * Render-layer restore, done correctly. We hook MessageStore.getMessages (the render data source)
 * and merge real MessageRecord instances (built by Discord's createMessageRecord) for our stored
 * deletions into the returned _array. Because they're genuine records, isNewMessageGroup doesn't
 * crash; because getMessages re-reads every draw and re-adds on reconcile, they persist.
 */
export function patchRenderRestore(getSettings: () => GhostLogSettings): () => void {
	// Revenge stopped loading every Flux store eagerly at startup (revenge-bundle-next 458e545), so
	// MessageStore is often not loaded yet when this runs just after start(). Reading
	// `Stores.MessageStore` then returned undefined and render restore switched itself off for the
	// whole session. Wait for the store instead; getStore calls back at once if it is already there.
	let cancelled = false
	let uninstall: (() => void) | undefined
	let unwait: (() => void) | undefined
	try {
		unwait = revenge.discord.flux.getStore('MessageStore', (ms: any) => {
			if (cancelled || uninstall) return
			try {
				uninstall = installRenderRestore(ms, getSettings)
			} catch (error) {
				console.error('[GhostLogNativeBeta] render restore failed to install:', error)
			}
		})
	} catch (error) {
		console.error('[GhostLogNativeBeta] waiting for MessageStore failed; render restore disabled:', error)
	}
	return () => {
		cancelled = true
		try { unwait?.() } catch (e) { /* ignore */ }
		try { uninstall?.() } catch (e) { /* ignore */ }
		uninstall = undefined
	}
}

function installRenderRestore(ms: any, getSettings: () => GhostLogSettings): () => void {
	if (typeof ms?.getMessages !== 'function') {
		console.error('[GhostLogNativeBeta] getMessages not found; render restore disabled')
		return () => {}
	}

	let pendingChannel: any

	// One memoized clone per channel. getMessages runs several times per frame and, before this,
	// every one of those calls rebuilt the merged array AND allocated a fresh clone object -- pure
	// garbage on the render path. The store hands back the same collection object (and the same
	// backing array) until it actually mutates, so keying on the array identity, its length and the
	// log version reuses the previous clone for every repeat call within a frame.
	// Bounded, unlike before. Each entry holds a whole merged message array and the key is the
	// channel, so this grew by one full conversation for every channel with logged deletions the
	// user visited, and was freed only when the plugin stopped -- growth tied to exactly the
	// usage this plugin exists for. Oldest goes first; losing a memo costs one rebuild.
	const MAX_CACHED_CHANNELS = 8
	const cloneCache = new Map<string, { source: any[]; length: number; head: string; tail: string; version: number; clone: any }>()

	// The memo is only sound while the SET OF IDS in the store's array is unchanged. Array identity
	// plus length alone was not enough: the store mutates its backing array in place, so a removal
	// paired with an insertion in the same frame keeps both identity and length while changing which
	// messages are present, and the stale clone would then hide a real message or double an injected
	// one. Fingerprinting the ends as well catches that at O(1). (Content edits need no invalidation:
	// the merged array holds references to the store's own records, so an in-place edit is visible
	// through the clone already.)
	const edgeId = (array: any[], index: number) => String(array[index]?.id ?? '')

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
			// "Off" means off. Restoring deleted messages into the chat while the user has the visual
			// style disabled put them back on screen through the other door.
			if (getSettings().deleteStyle === 'off') return ret

			const version = getLogVersion()
			const source: any[] = ret._array
			const head = edgeId(source, 0)
			const tail = edgeId(source, source.length - 1)
			const cached = cloneCache.get(channelId)
			if (
				cached &&
				cached.source === source &&
				cached.length === source.length &&
				cached.head === head &&
				cached.tail === tail &&
				cached.version === version
			) {
				return cached.clone
			}

			const all = getCachedLog()
			syncRecordCache(all, version)

			const entries = all.filter(e => e.channelId === channelId)
			if (!entries.length) return ret

			// Saved images/videos for this channel are decrypted on first sight of the channel, not at
			// startup for the whole log. Fire-and-forget: it bumps the log version when it lands, which
			// invalidates both caches above and rebuilds the records with local URIs.
			rehydrateChannel(channelId)

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
				// _map has to carry the injected records too. It is the collection's own id index, and
				// leaving it untouched produced a collection whose array contains ids that `get(id)` and
				// `has(id)` deny exist -- a caller that finds a row and then looks it up gets undefined.
				if (ret._map && typeof ret._map === 'object') {
					const map: Record<string, any> = { ...ret._map }
					for (const record of records) map[String(record.id)] = record
					clone._map = map
				}
				cloneCache.set(channelId, { source, length: source.length, head, tail, version, clone })
				// Map iterates in insertion order, so the first key is the least recently cached.
				while (cloneCache.size > MAX_CACHED_CHANNELS) {
					const oldest = cloneCache.keys().next()
					if (oldest.done) break
					cloneCache.delete(oldest.value)
				}
				return clone
			}
		} catch (error) {
			console.error('[GhostLogNativeBeta] render restore hook failed:', error)
		}
		return ret
	})

	return () => {
		cloneCache.clear()
		recordCache.clear()
		recordCacheVersion = -1
		try { before() } catch (e) { /* ignore */ }
		try { after() } catch (e) { /* ignore */ }
	}
}
