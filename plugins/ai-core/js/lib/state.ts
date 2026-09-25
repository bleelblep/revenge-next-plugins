import { DEFAULTS } from '../defaults'
import type { AiCoreStorage } from '../types'
import { vaultStatus } from './vault'

export const TAG = '[AiCore]'

type Storage = RevengeJsonStorageApi<AiCoreStorage>

let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback — porting rule 7. */
export function settings(): AiCoreStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function patch(value: Partial<AiCoreStorage>) {
	try {
		storage?.set(value)
	} catch (error) {
		console.error(`${TAG} failed to write storage:`, error)
	}
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}

/** Local calendar day, so the cap resets at the user's midnight rather than UTC's. */
export function today(): string {
	const d = new Date()
	const month = `${d.getMonth() + 1}`.padStart(2, '0')
	const day = `${d.getDate()}`.padStart(2, '0')
	return `${d.getFullYear()}-${month}-${day}`
}

/**
 * Today's remaining shared calls, from the native vault. The count and the cap live there, not in
 * jsonStorage, so no plugin can reset them by writing a file.
 */
export function callsRemaining(): number {
	const v = vaultStatus()
	// Tampering fails closed even with no cap; native reports 0 for it.
	if (v.unlimited && !v.usageTampered) return Number.POSITIVE_INFINITY
	return v.remaining
}

/** No limit. Also the tombstone for "never set" -- see the note on `perPluginCaps`. */
export const NO_CAP = -1

/** The cap configured for one plugin, or NO_CAP. */
export function capFor(pluginId: string): number {
	const s = settings()
	if (!s.enforcePerPluginCaps) return NO_CAP
	const cap = s.perPluginCaps?.[pluginId]
	return typeof cap === 'number' && cap >= 0 ? cap : NO_CAP
}

/** Calls this plugin has made today. */
export function callsBy(pluginId: string): number {
	return vaultStatus().byPlugin?.[pluginId] ?? 0
}

/**
 * How many calls this plugin may still make, counting both limits.
 *
 * The shared cap always applies, and is enforced natively. A per-plugin cap only narrows it
 * further -- raising one above the shared cap can never buy extra calls. Per-plugin caps are
 * checked here in JS, because the plugin id is whatever the caller says it is; they are a way to
 * mute a well-behaved plugin, not a defence against a hostile one.
 */
export function remainingFor(pluginId: string): number {
	const shared = callsRemaining()
	const cap = capFor(pluginId)
	if (cap === NO_CAP) return shared
	return Math.min(shared, Math.max(0, cap - callsBy(pluginId)))
}

/** Which plugins spent today's calls, most first. */
export function usageByPlugin(): Array<[string, number]> {
	return Object.entries(vaultStatus().byPlugin ?? {})
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1])
}
