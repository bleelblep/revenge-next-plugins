import { DEFAULTS } from '../defaults'
import type { StickerStorage } from '../types'

export const TAG = '[FreeStickers]'

let storage: RevengeJsonStorageApi<StickerStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<StickerStorage>) {
	storage = handle
}

export function settings(): StickerStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function useSettings(): StickerStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function update(patch: Partial<StickerStorage>) {
	storage?.set(patch)
}

export function toast(content: string) {
	try {
		revenge.discord.actions.ToastActionCreators.open({ key: 'FreeStickersToast', content })
	} catch {
		/* no toast */
	}
}
