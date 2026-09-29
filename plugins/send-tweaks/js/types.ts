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

/** One ClearURLs provider, as stored: regex sources, compiled when used. */
export interface ClearUrlsProvider {
	/** Matched against the whole URL to decide whether the provider applies. */
	pattern: string
	/** Parameter names, each a regex matched against the whole name. */
	rules: string[]
	/** Whole-URL regexes; a match means the provider leaves the URL alone. */
	exceptions: string[]
	/** Whole-URL regexes whose first group is the real destination of a redirect link. */
	redirections: string[]
}

export interface ClearUrlsData {
	/** When it was downloaded (ms since epoch). */
	updatedAt: number
	providers: ClearUrlsProvider[]
}

export interface SendTweaksStorage {
	/** Strip tracking parameters from links before a message goes out. */
	cleanUrls: boolean
	/** Also use the ClearURLs community rules (downloaded, refreshed weekly) on top of the built-in list. */
	clearUrlsRules: boolean
	/**
	 * The last ClearURLs rules downloaded, trimmed to what link cleaning uses. Null until the first
	 * download. Replaced whole on each update (an object, but every field is rewritten together).
	 */
	clearUrlsData: ClearUrlsData | null
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
	/**
	 * Send every new message as Discord's @silent: it arrives, but nobody gets a push or desktop
	 * notification for it. Edits are never affected -- a message's flags are fixed once sent.
	 */
	silentMessages: boolean
	/** Long-press the chat send button for a sheet of one-off sends and these switches. */
	sendButtonSheet: boolean
	/**
	 * What holding send does. `sheet` opens the sheet on the long-press. `swipe` arms on the
	 * long-press instead: slide up and let go to send unchanged; letting go early cancels. The sheet
	 * is off entirely in that mode.
	 */
	sendButtonMode: 'sheet' | 'swipe'
	/** The sheet's "This message" group: send silently / with notifications, send unchanged. */
	sheetThisMessage: boolean
	/** The sheet's switches (silent messages, link cleaning, rules, reply pings). */
	sheetSwitches: boolean
	/** The sheet's "More settings" row. */
	sheetMoreSettings: boolean
	/** Also apply link cleaning and text replacement when you edit a message. */
	applyToEdits: boolean
	debugLogging: boolean
}
