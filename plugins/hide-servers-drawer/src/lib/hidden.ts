import type { HideServersDrawerStorage } from "../index"

// A module-level Set is the source of truth, mirrored into jsonStorage for persistence.
// hidden.ts is used from patches and menu handlers that run outside of React (no `.use()`
// re-render to piggyback on), so state needs to be readable synchronously at any time --
// jsonStorage.cache covers that, but a plain Set keeps every read/write in this file free of
// repeated object-shape juggling.
let js: RevengeJsonStorageApi<HideServersDrawerStorage> | undefined
const ids = new Set<string>()
let mergedFromDisk = false

/** Must be called once from the plugin's start() before anything else in this module. */
export function init(jsonStorage: RevengeJsonStorageApi<HideServersDrawerStorage>) {
	js = jsonStorage
	mergedFromDisk = false
	ids.clear()
}

/**
 * The real, previously-undiagnosed cause of "later hides get lost on reopen" (a folder-hide or
 * an unhide would reproduce it identically): `load()` used to gate its one-shot disk merge on a
 * boolean that flipped true on its *first call*, not on the storage actually being ready.
 * `jsonStorage`'s `load: true` starts its read without awaiting it (docs/porting-rules.md rule
 * 6), so on every relaunch there was a real window where the Settings page's very first
 * `isHidden()` call -- which happens as soon as it mounts -- ran before that read resolved.
 * `js.cache.hidden` was still `undefined` at that exact moment, the old flag latched "loaded"
 * anyway, and this file never looked at disk again for the rest of the session. `ids` started
 * empty every relaunch after the first hide, so the *next* `persist()` -- rebuilt in full from
 * `ids` every time, by design -- overwrote the disk file with only that session's new edit,
 * discarding everything hidden in a previous session.
 *
 * `js.loaded` is the API's own real readiness flag (distinct from this file's own `.cache`
 * peeking), and it's cheap to recheck on every call until it flips -- unlike the old code, this
 * keeps retrying instead of giving up after one look.
 */
function load() {
	if (mergedFromDisk || !js?.loaded) return
	mergedFromDisk = true

	try {
		const saved = js.cache?.hidden
		// === true, not just key presence: persist() can now write an explicit `false` as a
		// tombstone for a just-unhidden id (see persist()'s own comment). Adding every key
		// regardless of value would un-delete every unhide this file has ever made.
		if (saved && typeof saved === "object") {
			for (const [id, value] of Object.entries(saved)) if (value === true) ids.add(id)
		}
	} catch {
		/* no persisted storage yet */
	}
}

/**
 * `jsonStorage.set()` performs a recursive merge (its `value` parameter is typed
 * `DeepPartial<T>`, confirmed in `types/next/lib/json-storage.d.ts`), not a replace. A merge can
 * only ever *add or overwrite* a key -- it structurally cannot express "this key is gone,"
 * because a key that's merely absent from the patch is indistinguishable from a key nobody
 * touched. This was the actual cause of "unhiding a server doesn't stick": the old code rebuilt
 * `out` fresh from `ids` on every call and simply omitted a just-unhidden id, so the merge left
 * its stale `true` entry sitting in storage untouched forever, and `load()` dutifully brought it
 * back on every relaunch. Hiding worked, because adding a new key is exactly what a merge is
 * good at -- only removal was broken, and only removal ever will be, with this API.
 *
 * The fix is to never rely on omission: `removed` lets a caller explicitly overwrite a key to
 * `false` instead of dropping it, which a merge propagates correctly because it's a write, not
 * an absence. `false` entries accumulate in storage as harmless tombstones rather than growing
 * unboundedly -- acceptable at the scale of "servers a person has ever hidden and un-hidden".
 */
function persist(removed?: Iterable<string>) {
	try {
		// Assign a whole new object rather than mutating in place.
		const out: Record<string, boolean> = {}
		for (const id of ids) out[id] = true
		if (removed) for (const id of removed) if (!(id in out)) out[id] = false
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
	if (hidden) {
		ids.add(key)
		persist()
	} else {
		ids.delete(key)
		persist([key])
	}
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
		if (js?.cache?.instant === undefined) js?.set({ instant: true })
		return js?.cache?.instant ?? true
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
	if (hidden) {
		ids.add(guildId)
		persist()
	} else {
		ids.delete(guildId)
		persist([guildId])
	}
}

export function clearHidden() {
	load()
	const removed = [...ids]
	ids.clear()
	persist(removed)
}

/** True when nothing is hidden, so the patches can skip work entirely. */
export function isEmpty(): boolean {
	load()
	return ids.size === 0
}
