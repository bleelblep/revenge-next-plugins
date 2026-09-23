export interface VeilStorage {
	/** Master switch. Off draws every message exactly as Discord would. */
	enabled: boolean

	// --- local rules: free, instant, never leave the device -----------------

	/**
	 * Words or phrases that blur a message, matched case-insensitively on word boundaries. Stored
	 * as an array and always written whole: `set()` replaces arrays, so removing one sticks.
	 */
	words: string[]
	/**
	 * Also match a word broken up with punctuation or spaces, like "f.i.n.a.l.e". Off by default:
	 * it matches across gaps, so a short word catches more than you would expect.
	 */
	looseWords: boolean
	/** Channels where every message is blurred. */
	channelIds: string[]
	/** People whose messages are always blurred. */
	userIds: string[]

	// --- the custom category, judged by a model through AI Core ------------

	/**
	 * What to blur, in the user's own words ("anything about diets", "match results"). Empty
	 * turns the AI layer off entirely.
	 */
	customCategory: string
	/**
	 * Channels the custom category is checked in. Opt-in per channel, because checking sends
	 * other people's messages to the AI provider and spends the daily cap.
	 */
	aiChannelIds: string[]
	/** Messages shorter than this are never sent for checking. */
	aiMinLength: number

	// --- presentation --------------------------------------------------------

	/** Also spoiler the attachments and embeds of a blurred message. */
	blurMedia: boolean
	/** A small line under the blur saying why, e.g. "Blurred: mentions “finale”". */
	showReason: boolean
	/** Never blur your own messages. */
	skipOwn: boolean

	debugLogging: boolean
}

/**
 * The slice of AI Core's decorated api this plugin uses. Declared locally: plugins are separate
 * bundles, so `api.ai` only exists at runtime and cannot be imported.
 */
export interface AiHandle {
	isAvailable(): boolean
	json<T = unknown>(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<T | undefined>
	budget(): {
		configured: boolean
		used: number
		cap: number
		remaining: number
	}
	setSettingsRoute?(route: string): void
}
