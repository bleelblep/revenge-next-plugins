import { DEFAULTS } from '../defaults'
import type { SendTweaksStorage } from '../types'

export const TAG = '[SendTweaks]'

type Storage = RevengeJsonStorageApi<SendTweaksStorage>

let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback. */
export function settings(): SendTweaksStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}
