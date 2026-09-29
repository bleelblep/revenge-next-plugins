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
	// A 400-token summary of a few hundred messages routinely takes 10-20 s; 45 leaves room for a
	// slow provider without leaving someone staring at nothing for minutes.
	aiTimeoutSeconds: 45,
}
