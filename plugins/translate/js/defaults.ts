import type { TranslateStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: TranslateStorage = {
	target: 'en',
	// Automatic by default. Any one of these services can start refusing requests without
	// notice, and a plugin that dies with it would be worse than one that quietly moves on.
	provider: 'auto',
	// Off: it is a request per foreign message, and that should be a decision.
	autoTranslate: false,
	markTranslated: true,
	highlightTranslated: true,
	showProvider: false,
	showDetected: true,
	skipSameLanguage: true,
	debugLogging: false,
}
