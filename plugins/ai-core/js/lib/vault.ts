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
	details?: string
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

export interface Balance {
	ok: boolean
	/** False when the provider has no way to report a balance to an ordinary key (OpenAI, Anthropic). */
	supported: boolean
	provider?: 'deepseek' | 'openrouter'
	currency?: string
	/** Money left: DeepSeek's total balance, or OpenRouter's credits bought minus used. */
	total?: number | null
	/** DeepSeek: of the total, free credit granted and money topped up. */
	granted?: number | null
	toppedUp?: number | null
	/** OpenRouter: this key's own spending limit and what is left of it, when one was set. */
	keyLimit?: number
	keyRemaining?: number
	error?: string
}

let lastBalance: { at: number; value: Balance } | undefined

/**
 * The money left on the key (`AiCore.kt` `balance`). Not a model call, so it costs nothing and is
 * not counted. Cached for a minute so several screens opening at once make one request.
 */
export async function fetchBalance(force = false): Promise<Balance> {
	if (!force && lastBalance && Date.now() - lastBalance.at < 60_000) return lastBalance.value
	let value: Balance
	try {
		value = JSON.parse(await call('balance')) as Balance
	} catch (error) {
		debug('balance failed:', error)
		value = { ok: false, supported: false, error: 'native' }
	}
	lastBalance = { at: Date.now(), value }
	return value
}

/** "$4.21", or "¥30.00" for yuan; the code itself for anything else. */
export function formatMoney(amount: number, currency = 'USD'): string {
	const symbol = currency === 'USD' ? '$' : currency === 'CNY' ? '¥' : ''
	const fixed = Math.abs(amount) < 1 ? amount.toFixed(3) : amount.toFixed(2)
	return symbol ? `${symbol}${fixed}` : `${fixed} ${currency}`
}

/** One line for a settings row: what is left, and a key limit if there is one. */
export function describeBalance(balance: Balance | undefined): string {
	if (!balance) return 'Checking…'
	if (!balance.supported) {
		return balance.error === 'no-key' ? 'No API key set' : "This provider doesn't report a balance to API keys"
	}
	if (!balance.ok) return "Couldn't get the balance right now. Tap to try again"
	const currency = balance.currency ?? 'USD'
	const parts: string[] = []
	if (typeof balance.total === 'number') parts.push(`${formatMoney(balance.total, currency)} left`)
	if (typeof balance.keyRemaining === 'number') {
		const limit = typeof balance.keyLimit === 'number' ? ` of ${formatMoney(balance.keyLimit, currency)}` : ''
		parts.push(`this key: ${formatMoney(balance.keyRemaining, currency)}${limit} left`)
	}
	if (typeof balance.granted === 'number' && balance.granted > 0) {
		parts.push(`${formatMoney(balance.granted, currency)} of it free credit`)
	}
	return parts.length ? parts.join(', ') : 'No limit set on this key'
}

/**
 * React hook: the balance, fetched when the screen opens and again when the key's endpoint
 * changes. `refresh()` forces a new request (a tap on the row).
 */
export function useBalance(): { balance: Balance | undefined; refresh: () => void } {
	const React = revenge.react.React
	const status = useVaultStatus()
	const [balance, setBalance] = React.useState<Balance | undefined>(lastBalance?.value)
	const load = (force: boolean) => {
		setBalance(undefined)
		fetchBalance(force).then(setBalance)
	}
	React.useEffect(() => {
		if (status.configured) load(false)
		else setBalance({ ok: false, supported: false, error: 'no-key' })
	}, [status.configured, status.endpoint])
	return { balance, refresh: () => load(true) }
}

/** For code outside React (the info global Plugin Hub reads): called on every status change. */
export function onStatusChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}
