import { DEFAULTS, type LiveMarkdownStorage, callNative } from '../native'
import { reportError } from '../../../../shared/report'

/** Set once in start(); the settings page reads it from here. */
let storage: RevengeJsonStorageApi<LiveMarkdownStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<LiveMarkdownStorage>) {
	storage = handle
}

/** The saved settings, re-rendering on change. Call like a hook. */
export function useSettings(): LiveMarkdownStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

/** Saves a change and hands it to native, which restyles open message boxes straight away. */
export function update(patch: Partial<LiveMarkdownStorage>) {
	// A list must replace, not merge: set() deep-merges arrays by index, so a shorter one would keep old entries.
	if (patch.menu) storage?.set({ ...DEFAULTS, ...((storage as any)?.cache ?? {}), ...patch }, true as any)
	else storage?.set(patch)
	callNative('setSettings', [patch]).catch(error => reportError('[LiveMarkdown] setSettings failed:', error))
}
