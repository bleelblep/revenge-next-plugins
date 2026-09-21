import type { ProviderId } from './lib/providers'

export interface TranslateStorage {
	/** Language to translate into. An ISO code Discord's users would recognise, e.g. "en". */
	target: string
	/**
	 * `auto` lets the chain pick: every provider is tried in order until one answers.
	 *
	 * Anything else pins a single service. Pinning is for when you have a preference; automatic
	 * is for when you want it to keep working.
	 */
	provider: ProviderId | 'auto'
	/**
	 * A line under every translated message saying so. On by default: a rewritten row is
	 * otherwise indistinguishable from what the author actually wrote.
	 */
	markTranslated: boolean
	/**
	 * A blue background and left bar on translated messages, the same way a mention is
	 * highlighted. Never replaces a highlight the message already has.
	 */
	highlightTranslated: boolean
	/** Say which service answered, under the translation. */
	showProvider: boolean
	/** Say what language it came from, when the service reports one. */
	showDetected: boolean
	/**
	 * Translate every message that does not look like it is already in the target language,
	 * without being asked.
	 *
	 * Filtered locally first (`lib/detect.ts`) so the obvious majority costs nothing, then
	 * capped per sweep -- see the note at the top of `patches/autoTranslate.ts`.
	 */
	autoTranslate: boolean
	/** Skip the work when the message is already in the target language. */
	skipSameLanguage: boolean
	debugLogging: boolean
}
