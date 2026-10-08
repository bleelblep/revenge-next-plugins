import { DEFAULTS, type LiveMarkdownStorage, callNative } from '../native'

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
	storage?.set(patch)
	callNative('setSettings', [patch]).catch(error => console.error('[LiveMarkdown] setSettings failed:', error))
}
