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
	/** Words (any case) that also hide a sticker whose name matches them. */
	stickerWords: string[]
	looseWords: boolean
	/** Channels where every message is blurred. */
	channelIds: string[]
	/** People whose messages are always blurred. */
	userIds: string[]

	// --- described rules: written once by AI Core, matched on the device -----

	/**
	 * Rules made from a description ("diet talk"): AI Core turns it into a list of words and
	 * phrases once, and from then on they are matched like `words`, on the device. No message is
	 * ever sent. Written whole, like every array here.
	 */
	topics: Topic[]
	/**
	 * Before 0.4.0: a description whose messages were each sent to AI Core to be judged. No longer
	 * used for matching; kept only so the Described rules page can offer to turn it into a rule.
	 * Cleared once that is done or dismissed.
	 */
	customCategory: string

	// --- the long-press menu ---------------------------------------------------

	/**
	 * Veil's rows in a message's long-press menu at all. The menu is the only way to add person,
	 * channel and AI-channel rules, so switching a row off freezes that list: existing rules keep
	 * working and can still be removed from settings, but new ones cannot be added until it is on.
	 */
	sheetActions: boolean
	/** "Blur messages from <person>". */
	sheetBlurPerson: boolean
	/** "Blur everything in <channel>". */
	sheetBlurChannel: boolean

	// --- presentation --------------------------------------------------------

	/** Also spoiler the attachments and embeds of a blurred message, and hide its stickers. */
	blurMedia: boolean
	/** A small line under the blur saying why, e.g. "Blurred: mentions “finale”". */
	showReason: boolean
	/** Never blur your own messages. */
	skipOwn: boolean

	debugLogging: boolean
}

export interface Topic {
	id: string
	/** Short label, shown in the blur reason: "Blurred: about Diets". */
	name: string
	/** What the user typed, kept so they can see what the rule was made from. */
	description: string
	words: string[]
	enabled: boolean
	/** Also hide a sticker whose name matches one of the words. */
	stickers?: boolean
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
