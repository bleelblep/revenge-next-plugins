import { DEFAULTS } from '../defaults'
import type { AiHandle, VeilStorage } from '../types'

export const TAG = '[Veil]'

type Storage = RevengeJsonStorageApi<VeilStorage>

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
export function settings(): VeilStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function patch(value: Partial<VeilStorage>) {
	try {
		storage?.set(value)
	} catch (error) {
		console.error(`${TAG} failed to write storage:`, error)
	}
}

/** Adds or removes one id in an id-list setting. Written whole, since `set()` replaces arrays. */
export function toggleId(
	key: 'channelIds' | 'userIds' | 'aiChannelIds',
	id: string,
	on: boolean,
) {
	const list = settings()[key].filter(existing => existing !== id)
	if (on) list.push(id)
	patch({ [key]: list })
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
		revenge.discord.actions.ToastActionCreators.open({ key: 'VeilToast', content })
	} catch {
		/* a missing toast is never worth a crash */
	}
}

export function currentUserId(): string | undefined {
	try {
		return (revenge.discord.flux.Stores as any)?.UserStore?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

export function channelName(id: string): string {
	try {
		const channel = (revenge.discord.flux.Stores as any)?.ChannelStore?.getChannel?.(id)
		return channel?.name ? `#${channel.name}` : id
	} catch {
		return id
	}
}

export function userName(id: string): string {
	try {
		const user = (revenge.discord.flux.Stores as any)?.UserStore?.getUser?.(id)
		return user?.globalName || user?.username || id
	} catch {
		return id
	}
}
