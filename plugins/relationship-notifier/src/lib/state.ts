import type { RelationshipNotifierStorage } from "../types"

/**
 * Sub-pages are rendered by Discord's settings navigator as plain routes and never receive the
 * plugin `api` object, so `start()` stashes the storage handle here for them.
 */
let storage: RevengeJsonStorageApi<RelationshipNotifierStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<RelationshipNotifierStorage>) {
	storage = handle
}

export function getStorage() {
	return storage
}
