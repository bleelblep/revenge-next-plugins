import type { TldrStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start (porting rule 7).
 */
export const DEFAULTS: TldrStorage = {
	minLength: 400,
	saved: [],
	keep: 200,
	debugLogging: false,
}
