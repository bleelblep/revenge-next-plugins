import type { GhostLogStorage } from "../types"

let storage: RevengeJsonStorageApi<GhostLogStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<GhostLogStorage>) {
	storage = handle
}

export function getStorage() {
	return storage
}
