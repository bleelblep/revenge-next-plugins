/**
 * The JS face of the native vault (`src/main/kotlin/.../AiCore.kt`).
 *
 * The key never comes back across this bridge -- there is no method that returns it. What does
 * come back is a status snapshot: whether a key is set, which endpoint it is bound to, the cap and
 * today's usage. Dependents' `isAvailable()` and `budget()` are synchronous, so that snapshot is
 * cached here and refreshed after every call that can change it.
 *
 * If the native half did not load, everything reports unconfigured and nothing calls out. There
 * is deliberately no plain-text fallback: a silent downgrade to the old storage would be exactly
 * the leak this exists to close.
 */

import { debug, TAG } from './state'

const ID = 'bleelblep.ai-core'

export interface VaultStatus {
	/** False when the native half is missing or failed to answer. */
	native: boolean
	configured: boolean
	/** The endpoint the key is bound to. Requests go here and nowhere else. */
	endpoint: string | null
	vaultError: string | null
	/** The usage file was altered or deleted; nothing calls out until a native reset. */
	usageTampered: boolean
	/** The vault has been written at least once, so the legacy import is closed. */
	migrated: boolean
	cap: number
	/** No daily ceiling. Calls are still counted. */
	unlimited: boolean
	day: string
	calls: number
	remaining: number
	promptTokens: number
	completionTokens: number
	byPlugin: Record<string, number>
	/** Set only by `promptForKey`, for an endpoint the vault refused. */
	error?: string
}

const OFFLINE: VaultStatus = {
	native: false,
	configured: false,
	endpoint: null,
	vaultError: null,
	usageTampered: false,
	migrated: false,
	cap: 0,
	unlimited: false,
	day: '',
	calls: 0,
	remaining: 0,
	promptTokens: 0,
	completionTokens: 0,
	byPlugin: {},
}

let current: VaultStatus = OFFLINE
const listeners = new Set<() => void>()

function call(method: string, args: unknown[] = []): Promise<any> {
	return (revenge.modules.native as any).callNativeMethod(`${ID}.${method}`, args)
}

function accept(raw: unknown): VaultStatus {
	try {
		const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
		current = { ...OFFLINE, ...parsed, native: true }
	} catch (error) {
		console.error(`${TAG} unreadable vault status:`, error)
	}
	for (const listener of listeners) listener()
	return current
}

async function statusCall(method: string, args: unknown[] = []): Promise<VaultStatus> {
	try {
		return accept(await call(method, args))
	} catch (error) {
		console.error(`${TAG} native ${method} failed:`, error)
		current = OFFLINE
		for (const listener of listeners) listener()
		return current
	}
}

export function vaultStatus(): VaultStatus {
	return current
}

export const refreshStatus = () => statusCall('status')
/** Opens the native key dialog. The key is typed there and never enters JS. */
export const promptForKey = (endpoint: string) => statusCall('promptForKey', [endpoint])
export const clearKey = () => statusCall('clearKey')
/** Raising asks for confirmation natively; lowering applies at once. */
export const setCap = (cap: number) => statusCall('setCap', [cap])
/** Turning it on needs a word typed into a native dialog; turning it off applies at once. */
export const setUnlimited = (value: boolean) => statusCall('setUnlimited', [value])
/** Always asks for confirmation natively. */
export const resetUsage = () => statusCall('resetUsage')

/**
 * Moves a key out of the old plain-text jsonStorage, once. The native side refuses this after the
 * vault has ever been written, so it cannot be used later to swap in a different key.
 */
export async function importLegacy(
	apiKey: string,
	baseUrl: string,
	cap: number,
): Promise<boolean> {
	try {
		const moved = await call('importLegacy', [apiKey, baseUrl, cap])
		await refreshStatus()
		return moved === true
	} catch (error) {
		console.error(`${TAG} legacy key import failed:`, error)
		return false
	}
}

export interface NativeResult {
	ok: boolean
	content?: string | null
	promptTokens?: number
	completionTokens?: number
	status?: number
	error?: string
}

export async function nativeRequest(
	pluginId: string,
	body: Record<string, unknown>,
	timeoutMs: number,
): Promise<NativeResult | undefined> {
	try {
		const raw = await call('request', [pluginId, body, timeoutMs])
		return JSON.parse(raw) as NativeResult
	} catch (error) {
		debug(`${pluginId}: native request failed:`, error)
		return undefined
	} finally {
		// Usage changed (or the call was refused); either way the snapshot is stale.
		refreshStatus()
	}
}

/** React hook: re-renders on every status change. */
export function useVaultStatus(): VaultStatus {
	const React = revenge.react.React
	const [, force] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(force)
		return () => {
			listeners.delete(force)
		}
	}, [])
	return current
}
