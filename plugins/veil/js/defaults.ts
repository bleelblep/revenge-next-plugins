import type { VeilStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start (porting rule 7).
 */
export const DEFAULTS: VeilStorage = {
	enabled: true,

	words: [],
	looseWords: false,
	channelIds: [],
	userIds: [],

	customCategory: '',
	aiChannelIds: [],
	aiMinLength: 20,

	blurMedia: true,
	showReason: true,
	skipOwn: true,

	debugLogging: false,
}
