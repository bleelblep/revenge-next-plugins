import { DEFAULTS } from '../defaults'
import type { TranslateStorage } from '../types'

export const TAG = '[Translate]'

type Storage = RevengeJsonStorageApi<TranslateStorage>

let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback. */
export function settings(): TranslateStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}

export function toast(content: string) {
	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: 'TranslateToast',
			content,
		})
	} catch {
		/* a missing toast must never turn a translation into a crash */
	}
}
