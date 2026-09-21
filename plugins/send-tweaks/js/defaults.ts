import type { SendTweaksStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: SendTweaksStorage = {
	// On: removing tracking never changes where a link goes, so there is nothing to lose.
	cleanUrls: true,
	// Off: pinging on reply is Discord's default and plenty of people rely on it. This is a
	// preference to opt into, not a fix.
	noReplyMention: false,
	// On, with no rules: harmless until you add one, and adding one should just work.
	textReplace: true,
	rules: [],
	applyToEdits: true,
	debugLogging: false,
}
