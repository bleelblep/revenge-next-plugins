import { DEFAULTS } from '../defaults'
import type { AiHandle, SecondThoughtsStorage } from '../types'

export const TAG = '[SecondThoughts]'

type Storage = RevengeJsonStorageApi<SecondThoughtsStorage>

let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/**
 * Never reads `cache` without a fallback -- see porting rule 7. Every caller gets a complete
 * settings object or the defaults, never a half-populated one.
 */
export function settings(): SecondThoughtsStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function patch(value: Partial<SecondThoughtsStorage>) {
	try {
		storage?.set(value)
	} catch (error) {
		console.error(`${TAG} failed to write storage:`, error)
	}
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}

export function toast(content: string) {
	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: 'SecondThoughtsToast',
			content,
		})
	} catch {
		/* a missing toast must never turn a check into a crash */
	}
}

// --- the optional AI handle -------------------------------------------------
//
// `api.ai` is decorated on by AI Core. The dependency is declared optional, so when AI Core is
// not installed this stays undefined for the whole session and the judgement checks simply never
// run. Nothing else in the plugin changes: the pattern checks are the product.

let ai: AiHandle | undefined

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

/** The handle itself, or undefined when AI Core is absent. */
export function getAi(): AiHandle | undefined {
	return ai
}

/** Installed, keyed, and with budget left. Anything less means the judgement checks are off. */
export function aiReady(): boolean {
	try {
		return !!ai?.isAvailable()
	} catch {
		return false
	}
}

export type AiStatus = 'absent' | 'unconfigured' | 'exhausted' | 'ready'

/** Why the judgement checks are or are not running, for the settings pages to explain. */
export function aiStatus(): AiStatus {
	if (!ai) return 'absent'
	try {
		const budget = ai.budget()
		if (!budget.configured) return 'unconfigured'
		if (budget.remaining <= 0) return 'exhausted'
		return 'ready'
	} catch {
		return 'absent'
	}
}

// --- send history ----------------------------------------------------------
//
// Burst detection needs to know how fast you have been firing messages off. Kept in memory on
// purpose: it is worthless across a restart and writing it would mean a storage write per send.

const recentSends: number[] = []

export function recordSend(at = Date.now()) {
	recentSends.push(at)
	// Only the last few seconds ever matter.
	while (recentSends.length && at - recentSends[0] > 30_000) recentSends.shift()
}

/** How many messages went out in the last `windowMs`. */
export function sendsWithin(windowMs: number, now = Date.now()): number {
	let count = 0
	for (let i = recentSends.length - 1; i >= 0; i--) {
		if (now - recentSends[i] > windowMs) break
		count++
	}
	return count
}

// --- snooze ----------------------------------------------------------------

export function isSnoozed(now = Date.now()): boolean {
	return settings().snoozedUntil > now
}

export function snooze(ms: number) {
	patch({ snoozedUntil: Date.now() + ms })
}
