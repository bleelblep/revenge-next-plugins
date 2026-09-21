import { DEFAULTS } from '../defaults'
import type { HubStorage } from '../types'

type Storage = RevengeJsonStorageApi<HubStorage>

let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback. */
export function settings(): HubStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}
