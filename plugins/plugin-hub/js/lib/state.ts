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

let ownVersion = 'unknown'

/** This plugin's version, for the row in Hub settings that unlocks Plugin Doctor. Set at start. */
export function setOwnVersion(value: string) {
	ownVersion = value
}

export function getOwnVersion(): string {
	return ownVersion
}

/** Never reads `cache` without a fallback. */
export function settings(): HubStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}
