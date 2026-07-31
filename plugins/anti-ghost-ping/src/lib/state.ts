import type { AntiGhostPingStorage } from "../types"

/**
 * The log page is rendered by Discord's settings navigator as a plain route, so unlike the root
 * settings component it never receives the plugin `api` object. `start()` stashes the storage
 * handle here for it.
 */
let storage: RevengeJsonStorageApi<AntiGhostPingStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<AntiGhostPingStorage>) {
	storage = handle
}

export function getStorage() {
	return storage
}
