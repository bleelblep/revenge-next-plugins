import { DEFAULTS } from '../defaults'
import type { AiHandle, SendTweaksStorage } from '../types'

export const TAG = '[SendTweaks]'

type Storage = RevengeJsonStorageApi<SendTweaksStorage>

let storage: Storage | undefined
let ai: AiHandle | undefined

/** AI Core's handle, or undefined when AI Core is not installed. */
export function getAi(): AiHandle | undefined {
	return ai
}

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

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
