import type { HideServersDrawerStorage } from "../index"

// Small, separate from hidden.ts on purpose -- this is a display preference, not part of
// what's hidden, and doesn't need the module-level Set/load()/persist() machinery: a single
// boolean flag is safe to read directly off jsonStorage.cache either way.

let js: RevengeJsonStorageApi<HideServersDrawerStorage> | undefined

/** Must be called once from the plugin's start(), same as hidden.ts's init(). */
export function initPrefs(jsonStorage: RevengeJsonStorageApi<HideServersDrawerStorage>) {
	js = jsonStorage
}

export function staticIcons(): boolean {
	try {
		return !!js?.cache?.staticIcons
	} catch {
		return false
	}
}

export function setStaticIcons(value: boolean) {
	try {
		js?.set({ staticIcons: value })
	} catch {
		/* session-only, still works until restart */
	}
}
