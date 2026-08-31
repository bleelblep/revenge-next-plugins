import { callNativeMethod } from '../lib/native'
import { loadRichContent } from '../lib/richContent'
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

export async function clearNativeLog(): Promise<void> {
	try {
		await callNativeMethod(`${ID}.clearLog`, [])
	} catch (error) {
		console.error('[GhostLogNativeBeta] clearLog failed:', error)
	}
	cache = []
	notify()
}

/** Keep the JS cache in step with a freshly captured entry (native store is the source of truth). */
export function addToCache(entry: DeletedMessage) {
	cache = [entry, ...cache.filter(e => e.id !== entry.id)]
	notify()
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
