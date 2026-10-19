/**
 * Settings, lists and per-user overrides, in the plugin's jsonStorage.
 *
 * Reads come from one in-memory mirror, never `jsonStorage.cache`: the cache is per handle and
 * misses writes made through another one (the settings page can get its own), and `get()` is
 * async. The mirror is fed by `subscribe`, which does fire across handles.
 *
 * Saving: until the file has loaded, a write is a merge (so it can't wipe what's on disk); once
 * loaded, the whole mirror replaces the file. That keeps removals removed without tombstones
 * piling up, and is what makes the lists stick across restarts.
 *
 * The settings page binds its own `api.jsonStorage` when start() never ran (plugin enabled
 * mid-session, which returns early to ask for a reload), so changes made there still save.
 */

import * as React from 'react'

/** Whose badges show; see lib/filter.ts. */
export type FilterMode = 'everyone' | 'only' | 'except'

/** A list entry: the name they had when added (Discord may not have them cached later) and when. */
export interface ListEntry {
	name: string
	at: number
}

export interface PronounsStorage {
	/** The tag next to author names in chat. */
	showInChat: boolean
	/** Discord's own pronouns before PronounDB. Off asks PronounDB first. Moot when pronounDbEnabled is off. */
	discordFirst: boolean
	/** Ask pronoundb.org when a profile has no pronouns. Off: Discord's own pronouns only, nothing is fetched. */
	pronounDbEnabled: boolean
	/** Only show real pronouns (see lib/validate.ts); anything else in the field is dropped. */
	validOnly: boolean
	/** With validOnly: count "any" / "all" as pronouns. */
	allowAnyAll: boolean
	/** With validOnly: extra words to accept, as typed. */
	extraPronouns: string
	/** One colour for everyone (badgeColor) vs. a colour per person (perPersonColors). */
	colorMode: ColorMode
	/** Badge background as #RRGGBB; '' keeps Discord's tag colour. Used when colorMode is 'global'. */
	badgeColor: string
	/** Per-person badge background as #RRGGBB, keyed by user id; null clears back to the default. Used when colorMode is 'perPerson'. */
	perPersonColors: Record<string, string | null>
	/** Use the author's role colour when they have one (falls back to badgeColor / perPersonColors). */
	useRoleColor: boolean
	/** Pronouns you set yourself, per user id. Never filtered. */
	overrides: Record<string, string | null>
	/** Everyone, only [showList], or everyone except [hideList]. */
	filterMode: FilterMode
	showList: Record<string, ListEntry | string | null>
	hideList: Record<string, ListEntry | string | null>
}

/** Whether the badge colour is one setting for everyone or set per person. */
export type ColorMode = 'global' | 'perPerson'

export const DEFAULTS: PronounsStorage = {
	showInChat: true,
	discordFirst: true,
	pronounDbEnabled: true,
	validOnly: false,
	allowAnyAll: true,
	extraPronouns: '',
	colorMode: 'global',
	badgeColor: '',
	perPersonColors: {},
	useRoleColor: false,
	overrides: {},
	filterMode: 'everyone',
	showList: {},
	hideList: {},
}

type Handle = RevengeJsonStorageApi<PronounsStorage>

let storage: Handle | undefined
let unsubscribe: (() => void) | undefined
let loaded = false
let mirror: PronounsStorage = { ...DEFAULTS }
const listeners = new Set<() => void>()

function notify() {
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the rest */
		}
	}
}

/** Merges a stored value or patch over [base], dropping null tombstones from older versions. */
function merge(base: PronounsStorage, value: any): PronounsStorage {
	const next: any = { ...base, ...(value ?? {}) }
	for (const key of ['overrides', 'showList', 'hideList', 'perPersonColors'] as const) {
		const map = { ...(value?.[key] && typeof value[key] === 'object' ? { ...base[key], ...value[key] } : base[key]) }
		for (const id of Object.keys(map)) if (map[id] == null) delete map[id]
		next[key] = map
	}
	return next
}

/** Binds [handle] as the storage, reading the file. Safe to call again with the same handle. */
export function setStorage(handle: Handle | undefined) {
	if (handle && handle === storage) return
	unsubscribe?.()
	unsubscribe = undefined
	storage = handle
	loaded = false
	mirror = { ...DEFAULTS }
	if (!handle) return
	const cache = (handle as any).cache
	if (cache) {
		mirror = merge(DEFAULTS, cache)
		loaded = true
	}
	unsubscribe = (handle as any).subscribe?.((update: any, mode: number) => {
		// 0 = a merge patch; anything else = replaced or loaded from disk.
		mirror = merge(mode === 0 ? mirror : DEFAULTS, update)
		loaded = true
		notify()
	})
	void Promise.resolve((handle as any).get?.())
		.then((value: any) => {
			if (value) mirror = merge(DEFAULTS, value)
			loaded = true
			notify()
		})
		.catch(() => {
			/* keep the mirror; the next save retries */
		})
}

/** For the settings page: binds its own handle only when start() didn't bind one. */
export function bindSettingsStorage(handle: Handle | undefined) {
	if (!storage && handle) setStorage(handle)
}

/** Read at any time; the defaults until storage loads. */
export function settings(): PronounsStorage {
	return mirror
}

/** The settings, re-rendering on change. Call like a hook. */
export function useSettings(): PronounsStorage {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => onUpdate(bump), [])
	return mirror
}

export function update(patch: Partial<PronounsStorage>) {
	mirror = merge(mirror, patch)
	// A map in [patch] replaces the old one outright (merge() unions them).
	for (const key of ['overrides', 'showList', 'hideList', 'perPersonColors'] as const) {
		if (patch[key]) {
			const map: any = { ...patch[key] }
			for (const id of Object.keys(map)) if (map[id] == null) delete map[id]
			mirror = { ...mirror, [key]: map }
		}
	}
	notify()
	try {
		const write = loaded ? (storage as any)?.set?.(mirror, true) : storage?.set(patch as any)
		void Promise.resolve(write).catch(() => {
			/* storage refused; the mirror still has it for this session */
		})
	} catch {
		/* as above */
	}
}

/** Runs [fn] after every change, from this plugin or the file. */
export function onUpdate(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
