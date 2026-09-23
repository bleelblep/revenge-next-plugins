/** One summary, kept so asking again after a restart costs nothing. */
export interface SavedSummary {
	/** Message id and edit time, so an edited message is summarised again. */
	key: string
	text: string
	/** When it was made, for pruning the oldest first. */
	at: number
}

export interface TldrStorage {
	/** Messages shorter than this (text plus embed descriptions) are not offered a TL;DR. */
	minLength: number
	/**
	 * Summaries already made, newest last.
	 *
	 * Stored as an array and always written whole: `jsonStorage.set()` deep-merges objects but
	 * *replaces* arrays, so pruning and clearing actually stick -- a keyed object could never
	 * drop an entry (docs/porting-rules.md rule 6).
	 */
	saved: SavedSummary[]
	/** How many to keep. Older ones are dropped first. */
	keep: number
	debugLogging: boolean
}

/**
 * The slice of AI Core's decorated api this plugin uses. Declared locally: plugins are separate
 * bundles, so `api.ai` only exists at runtime and cannot be imported.
 */
export interface AiHandle {
	isAvailable(): boolean
	text(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<string | undefined>
	budget(): {
		configured: boolean
		used: number
		cap: number
		remaining: number
	}
	setSettingsRoute?(route: string): void
}
