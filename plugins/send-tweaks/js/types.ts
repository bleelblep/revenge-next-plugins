import type { Rule } from './lib/textReplace'

export type { Rule }

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
	/** Also apply link cleaning and text replacement when you edit a message. */
	applyToEdits: boolean
	debugLogging: boolean
}
