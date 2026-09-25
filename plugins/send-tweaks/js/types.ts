import type { Rule } from './lib/textReplace'

export type { Rule }

/**
 * The slice of AI Core's decorated api this plugin uses. Declared locally: plugins are separate
 * bundles, so `api.ai` only exists at runtime and cannot be imported. Undefined when AI Core is not
 * installed -- AI Core is an optional dependency, and everything AI-related is hidden without it.
 */
export interface AiHandle {
	isAvailable(): boolean
	json<T = unknown>(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<T | undefined>
	budget(): { configured: boolean; used: number; cap: number; remaining: number; unlimited?: boolean }
	setSettingsRoute?(route: string): void
}

export interface SendTweaksStorage {
	/** Strip tracking parameters from links before a message goes out. */
	cleanUrls: boolean
	/** Start every reply with the mention switched off. Discord's own @ toggle still works. */
	noReplyMention: boolean
	/** Run your find-and-replace rules on outgoing messages. */
	textReplace: boolean
	/**
	 * Stored as an array and always written whole. `jsonStorage.set()` deep-merges objects but
	 * *replaces* arrays (`isObject` in revenge-bundle-next's `lib/utils/src/object.ts` excludes
	 * them), so deleting a rule sticks -- unlike a keyed object, where porting rule 6 applies.
	 */
	rules: Rule[]
	/** Run your link rules (e.g. twitter.com -> fxtwitter.com) inside links. */
	linkRewrite: boolean
	/** Rules applied only inside links. Stored whole, like `rules`. */
	linkRules: Rule[]
	/** Also apply link cleaning and text replacement when you edit a message. */
	applyToEdits: boolean
	debugLogging: boolean
}
