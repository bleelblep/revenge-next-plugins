import type { CatchUpStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start (porting rule 7).
 */
export const DEFAULTS: CatchUpStorage = {
	// Enough to cover a lunch break in a busy channel without being a big prompt.
	defaultCount: 100,
	maxCount: 500,
	skipBots: true,
	announce: true,
	debugLogging: false,
}
