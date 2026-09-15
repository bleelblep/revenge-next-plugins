import { callNativeMethod } from '../lib/native'
import { loadRichContent, rehydrateEntries } from '../lib/richContent'
import type { GhostLogSettings } from '../types'

const ID = 'bleelblep.ghost-log-native-beta'

// Route pages (Log, Options) are plain navigator screens with no plugin `api` prop, so the
// settings storage handle is stashed here on start, mirroring stable's lib/state pattern.
let settingsStorage: any

export function setSettingsStorage(handle: any) {
	settingsStorage = handle
}

export function getSettingsStorage(): any {
	return settingsStorage
}

export interface DeletedMessage {
	id: string
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	authorAvatar?: string
	guildIcon?: string
	content: string
	attachments?: any[]
	embeds?: any[]
	// Captured so a message rebuilt from the log is not a stripped-down copy of itself. A single
	// delete keeps its real record in the store (the dispatcher converts the event), but a BULK
	// delete does not -- those messages are genuinely removed and come back only through
	// render-restore, which builds from these fields. Without them a purged reply lost its reply
	// context and every mention rendered as raw markup.
	mentions?: any[]
	mentionRoles?: string[]
	mentionEveryone?: boolean
	editedAt?: number
	messageType?: number
	flags?: number
	pinned?: boolean
	tts?: boolean
	referencedMessage?: { id: string; channelId: string; author?: any; content?: string }
	sentAt: number
	deletedAt: number
}

// The log lives in native storage, so it is not reactive like jsonStorage. We cache it here and
// fan out to subscribers whenever a load/clear completes. Pages subscribe and refresh on mount.
let cache: DeletedMessage[] = []
let loading = false
const listeners = new Set<() => void>()

// Bumped on every mutation of `cache`. The render-restore hook runs on MessageStore.getMessages
// -- i.e. several times per frame -- and needs an O(1) way to answer "has the log changed since
// the last time I built records for this channel?" without rescanning or rebuilding anything.
let version = 0

export function getLogVersion(): number {
	return version
}

function notify() {
	version++
	for (const fn of listeners) fn()
}

export function subscribeLog(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

export async function refreshLog(): Promise<DeletedMessage[]> {
	if (loading) return cache
	loading = true
		try {
			const raw = await callNativeMethod(`${ID}.getLog`, [])
			const entries = raw ? (JSON.parse(raw) as DeletedMessage[]) : []
			// Metadata only. Saved media is resolved lazily per channel by rehydrateChannel -- see
			// loadRichContent's note for why doing it all here was the out-of-memory kill.
			const rich = await loadRichContent(entries.map(entry => entry.id))
			// Assign the cache ONCE, after rich content is merged. Assigning text-only entries first
			// exposed an intermediate state to the render-restore hook, which memoized MessageRecords
			// with empty attachments/embeds and never rebuilt them once the rich content landed.
			cache = entries.map(entry => ({ ...entry, ...(rich.get(entry.id) ?? {}) }))
			console.log(`[GhostLogNativeBeta] cache loaded ${cache.length} entries`)
		} catch (error) {
		console.error('[GhostLogNativeBeta] getLog failed:', error)
		cache = []
	} finally {
		loading = false
		notify()
	}
	return cache
}

// Channels whose saved media has already been resolved (or is in flight). The render-restore hook
// runs several times per frame, so this has to be an O(1) "have I already asked?" check.
const rehydratedChannels = new Set<string>()
// Bounded retries per channel, so a permanently broken blob does not turn the render path into a
// retry loop while a transient native failure still gets another chance.
const rehydrateAttempts = new Map<string, number>()
const REHYDRATE_MAX_ATTEMPTS = 3

/**
 * Resolve saved media for one channel's entries, once. Called from the render path, which is why it
 * must never block: it fires the work and bumps the log version when it lands, so memoized records
 * rebuild on a later frame with the local URIs in place.
 */
export function rehydrateChannel(channelId: string): void {
	if (!channelId || rehydratedChannels.has(channelId)) return
	rehydratedChannels.add(channelId)
	const entries = cache.filter(entry => entry.channelId === channelId)
	if (!entries.length) {
		rehydratedChannels.delete(channelId)
		return
	}
	const attempt = (rehydrateAttempts.get(channelId) ?? 0) + 1
	rehydrateAttempts.set(channelId, attempt)

	void rehydrateEntries(entries)
		.then(({ changed, complete }) => {
			// Anything still unresolved gets another pass on a later frame, up to the attempt cap.
			if (!complete && attempt < REHYDRATE_MAX_ATTEMPTS) rehydratedChannels.delete(channelId)
			if (changed) notify()
		})
		.catch(error => {
			if (attempt < REHYDRATE_MAX_ATTEMPTS) rehydratedChannels.delete(channelId)
			console.error('[GhostLogNativeBeta] media rehydrate failed:', error)
		})
}

export interface StorageStatus {
	baseDir: string
	requestedDir: string
	usingFallback: boolean
	error?: string | null
	lastWriteError?: string | null
	entries: number
}

let storageStatus: StorageStatus | undefined

export function getStorageStatus(): StorageStatus | undefined {
	return storageStatus
}

export async function refreshStorageStatus(): Promise<StorageStatus | undefined> {
	try {
		const raw = await callNativeMethod(`${ID}.getStorageStatus`, [])
		storageStatus = raw ? (JSON.parse(raw) as StorageStatus) : undefined
		if (storageStatus?.usingFallback) {
			console.error(
				`[GhostLogNativeBeta] storage fallback: ${storageStatus.requestedDir} is unusable (${storageStatus.error}); writing to ${storageStatus.baseDir}`,
			)
		}
	} catch (error) {
		console.error('[GhostLogNativeBeta] getStorageStatus failed:', error)
	}
	notify()
	return storageStatus
}

/** React hook: the current native storage health, refreshed on mount. */
export function useStorageStatus(): StorageStatus | undefined {
	const { React } = revenge.react
	const [status, setStatus] = React.useState<StorageStatus | undefined>(getStorageStatus())

	React.useEffect(() => {
		const unsub = subscribeLog(() => setStatus(getStorageStatus()))
		void refreshStorageStatus()
		return unsub
	}, [])

	return status
}

export async function clearNativeLog(): Promise<void> {
	try {
		await callNativeMethod(`${ID}.clearLog`, [])
	} catch (error) {
		console.error('[GhostLogNativeBeta] clearLog failed:', error)
	}
	cache = []
	pendingAdds.length = 0
	if (addTimer !== undefined) {
		clearTimeout(addTimer)
		addTimer = undefined
	}
	rehydratedChannels.clear()
	rehydrateAttempts.clear()
	notify()
}

// Captures arriving in a burst are staged here and folded into `cache` once, on a trailing timer.
//
// This used to rebuild the whole array and fan out to every listener PER CATCH:
// `cache = [entry, ...cache.filter(...)]` is O(entries), so a 500-message purge copied ~125k
// elements and fired 500 render-cache invalidations. That was the JS half of the same quadratic
// blow-up the native side had, and fixing only the native half left the stall in place.
const pendingAdds: DeletedMessage[] = []
let addTimer: ReturnType<typeof setTimeout> | undefined
const ADD_FLUSH_MS = 250

function flushAdds() {
	addTimer = undefined
	if (!pendingAdds.length) return
	// Newest first, matching the native log's own order.
	const batch = pendingAdds.splice(0, pendingAdds.length).reverse()
	const incoming = new Set(batch.map(entry => entry.id))
	cache = [...batch, ...cache.filter(e => !incoming.has(e.id))]
	notify()
}

/** Keep the JS cache in step with a freshly captured entry (native store is the source of truth). */
export function addToCache(entry: DeletedMessage) {
	pendingAdds.push(entry)
	// This channel has a new entry whose saved media has not been resolved, so let the render path
	// ask again rather than leaving the new message pointing at a CDN url that may already be dead.
	rehydratedChannels.delete(entry.channelId)
	rehydrateAttempts.delete(entry.channelId)
	if (addTimer === undefined) addTimer = setTimeout(flushAdds, ADD_FLUSH_MS)
}

/** Fold any staged captures in now. Call before anything that reads the cache as authoritative. */
export function flushPendingAdds() {
	if (addTimer !== undefined) {
		clearTimeout(addTimer)
		addTimer = undefined
	}
	flushAdds()
}

export function getCachedLog(): DeletedMessage[] {
	return cache
}

/** React hook: subscribe to native log updates and trigger a load on first mount. */
export function useLog(): DeletedMessage[] {
	const { React } = revenge.react
	const [entries, setEntries] = React.useState<DeletedMessage[]>(getCachedLog())

	React.useEffect(() => {
		const unsub = subscribeLog(() => setEntries(getCachedLog()))
		void refreshLog()
		return unsub
	}, [])

	return entries
}
