import { DEFAULTS } from '../defaults'
import type { AiCoreStorage } from '../types'

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

export function callsRemaining(): number {
	const s = settings()
	if (s.usageDay !== today()) return s.dailyCallCap
	return Math.max(0, s.dailyCallCap - s.usageCalls)
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
	const s = settings()
	if (s.usageDay !== today()) return 0
	return s.usageByPlugin?.[pluginId] ?? 0
}

/**
 * How many calls this plugin may still make, counting both limits.
 *
 * The shared cap always applies. A per-plugin cap only narrows it further -- raising one above
 * the shared cap can never buy extra calls, which is what makes the shared number meaningful.
 */
export function remainingFor(pluginId: string): number {
	const shared = callsRemaining()
	const cap = capFor(pluginId)
	if (cap === NO_CAP) return shared
	return Math.min(shared, Math.max(0, cap - callsBy(pluginId)))
}

/**
 * Zeroes every known plugin rather than dropping it.
 *
 * `jsonStorage.set()` merges, and a merge can never remove a key — a key left out of the patch
 * is indistinguishable from one nobody touched, so passing a fresh `{}` on a day roll would
 * leave yesterday's counts sitting there untouched and growing for ever (porting rule 6).
 * An explicit `0` is the tombstone, and readers treat `0` as absent.
 */
function clearedCounts(
	previous: Record<string, number>,
): Record<string, number> {
	const out: Record<string, number> = {}
	for (const id of Object.keys(previous)) out[id] = 0
	return out
}

/**
 * Usage is attributed to the plugin that asked, so the settings page can say which one is
 * spending the budget rather than only that it is gone.
 */
export function recordCall(
	pluginId: string,
	promptTokens: number,
	completionTokens: number,
) {
	const s = settings()
	const fresh = s.usageDay !== today()
	const byPlugin = fresh
		? clearedCounts(s.usageByPlugin)
		: { ...s.usageByPlugin }
	byPlugin[pluginId] = (byPlugin[pluginId] ?? 0) + 1

	patch({
		usageDay: today(),
		usageCalls: (fresh ? 0 : s.usageCalls) + 1,
		usagePromptTokens: (fresh ? 0 : s.usagePromptTokens) + promptTokens,
		usageCompletionTokens:
			(fresh ? 0 : s.usageCompletionTokens) + completionTokens,
		usageByPlugin: byPlugin,
	})
}

export function resetUsage() {
	patch({
		usageDay: today(),
		usageCalls: 0,
		usagePromptTokens: 0,
		usageCompletionTokens: 0,
		usageByPlugin: clearedCounts(settings().usageByPlugin),
	})
}

/** Reading side of the tombstone: a zeroed entry is not a plugin that used anything. */
export function usageByPlugin(): Array<[string, number]> {
	return Object.entries(settings().usageByPlugin)
		.filter(([, count]) => count > 0)
		.sort((a, b) => b[1] - a[1])
}
