import type { HideServersDrawerStorage } from "../index"

// A module-level Set is the source of truth, mirrored into jsonStorage for persistence.
// hidden.ts is used from patches and menu handlers that run outside of React (no `.use()`
// re-render to piggyback on), so state needs to be readable synchronously at any time --
// jsonStorage.cache covers that, but a plain Set keeps every read/write in this file free of
// repeated object-shape juggling.
let js: RevengeJsonStorageApi<HideServersDrawerStorage> | undefined
const ids = new Set<string>()
let loaded = false

/** Must be called once from the plugin's start() before anything else in this module. */
export function init(jsonStorage: RevengeJsonStorageApi<HideServersDrawerStorage>) {
	js = jsonStorage
	loaded = false
	ids.clear()
}

function load() {
	if (loaded) return
	loaded = true

	try {
		const saved = js?.cache.hidden
		if (saved && typeof saved === "object") {
			for (const id of Object.keys(saved)) ids.add(id)
		}
	} catch {
		/* no persisted storage yet */
	}
}

function persist() {
	try {
		// Assign a whole new object rather than mutating in place.
		const out: Record<string, true> = {}
		for (const id of ids) out[id] = true
		js?.set({ hidden: out })
	} catch {
		/* session-only, still works until restart */
	}
}

export function isHidden(guildId: string): boolean {
	load()
	return ids.has(guildId)
}

// Folder ids are numbers where guild ids are strings (see patches/sortedGuilds.ts), and share
// the same storage blob as a "folder:<id>" key rather than a second Set.
function folderKey(folderId: string | number): string {
	return `folder:${folderId}`
}

export function isFolderHidden(folderId: string | number): boolean {
	load()
	return ids.has(folderKey(folderId))
}

export function setFolderHidden(folderId: string | number, hidden: boolean) {
	load()
	const key = folderKey(folderId)
	if (hidden) ids.add(key)
	else ids.delete(key)
	persist()
}

export function hiddenFolderIds(): string[] {
	load()
	return [...ids].filter(id => id.startsWith("folder:")).map(id => id.slice("folder:".length))
}

/**
 * Suppress hidden servers in the bar by swapping in the non-virtualized bar.
 *
 * On by default, because it is the only thing that actually hides anything -- filtering
 * SortedGuildStore alone has no visible effect on the real bar. The cost is that a hidden
 * row stays in the virtualized list's geometry, leaving a gap and jumping the scroll
 * position when a server is tapped. Turn it off to get an untouched bar and no hiding.
 */
export function instant(): boolean {
	load()
	try {
		if (js?.cache.instant === undefined) js?.set({ instant: true })
		return js?.cache.instant ?? true
	} catch {
		return true
	}
}

export function setInstant(value: boolean) {
	try {
		js?.set({ instant: value })
	} catch {
		/* session default stays */
	}
}

export function hiddenIds(): string[] {
	load()
	return [...ids].filter(id => !id.startsWith("folder:"))
}

export function setHidden(guildId: string, hidden: boolean) {
	load()
	if (hidden) ids.add(guildId)
	else ids.delete(guildId)
	persist()
}

export function clearHidden() {
	load()
	ids.clear()
	persist()
}

/** True when nothing is hidden, so the patches can skip work entirely. */
export function isEmpty(): boolean {
	load()
	return ids.size === 0
}
