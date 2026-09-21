/** Everything the plugin can hold a message for. `none` is the pass verdict. */
export type Category =
	| 'credentials'
	| 'personal'
	| 'hostile'
	| 'drunk'
	| 'oversharing'

export interface Verdict {
	/** True means: do not send, ask the user first. */
	hold: boolean
	category: Category | 'none'
	/** One line, addressed to the author. Shown verbatim in the modal. */
	reason: string
	/** Which half of the plugin decided. `local` means no AI call was made. */
	source: 'local' | 'model'
	confidence?: number
}

/**
 * Storage holds no provider settings on purpose.
 *
 * The key, the endpoint, the model, the timeout and the spending cap all belong to AI Core, which
 * is an optional dependency. Duplicating them here would mean two places to set the same thing
 * and two caps that each believe they are the limit.
 */
export interface SecondThoughtsStorage {
	enabled: boolean

	// --- Patterns: always available, no AI involved ---------------------------
	/** Tokens, API keys, private keys, Luhn-valid card numbers. */
	checkCredentials: boolean
	/** Phone numbers, emails, street addresses. Off by default — usually deliberate. */
	checkPersonalDetails: boolean
	/** Whether the personal-details check also applies in DMs and group DMs. */
	personalDetailsInDms: boolean

	// --- Judgement: needs AI Core installed and configured --------------------
	checkHostile: boolean
	checkDrunk: boolean
	checkOversharing: boolean
	/** Gate score a draft must reach before the plugin is willing to spend a call. */
	sensitivity: number
	/** Drafts shorter than this never reach the judgement checks. Patterns ignore it. */
	minLength: number

	/** Epoch ms. While in the future, the judgement checks are skipped. */
	snoozedUntil: number

	debugLogging: boolean
}

/**
 * The slice of AI Core's decorated api this plugin uses.
 *
 * Declared locally rather than imported: the dependency is optional, so there is nothing to
 * import from when AI Core is not installed, and `api.ai` is simply `undefined`.
 */
export interface AiHandle {
	isAvailable(): boolean
	json<T = unknown>(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
	}): Promise<T | undefined>
	budget(): {
		configured: boolean
		used: number
		cap: number
		remaining: number
	}
	/**
	 * Lets AI Core's settings screen link back to ours. Added in AI Core 1.1.0, so optional on
	 * both sides — an older AI Core simply has no method here and no link gets made.
	 */
	setSettingsRoute?(route: string): void
}
