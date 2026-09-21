import { DEFAULTS } from '../defaults'
import type { AiHandle, CatchUpStorage } from '../types'

export const TAG = '[CatchUp]'

type Storage = RevengeJsonStorageApi<CatchUpStorage>

let storage: Storage | undefined
let ai: AiHandle | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback -- porting rule 7. */
export function settings(): CatchUpStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

export function getAi(): AiHandle | undefined {
	return ai
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}

export function toast(content: string) {
	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: 'CatchUpToast',
			content,
		})
	} catch {
		/* a missing toast must never turn a summary into a crash */
	}
}
