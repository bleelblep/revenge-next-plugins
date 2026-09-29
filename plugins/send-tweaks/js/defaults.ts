import type { SendTweaksStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: SendTweaksStorage = {
	// On: removing tracking never changes where a link goes, so there is nothing to lose.
	cleanUrls: true,
	// On: it only ever adds to what is removed, and the built-in list is used until it downloads.
	clearUrlsRules: true,
	clearUrlsData: null,
	// Off: pinging on reply is Discord's default and plenty of people rely on it. This is a
	// preference to opt into, not a fix.
	noReplyMention: false,
	// On, with no rules: harmless until you add one, and adding one should just work.
	textReplace: true,
	rules: [],
	// On, with no rules: nothing happens until you add or import one.
	linkRewrite: true,
	linkRules: [],
	// Off: a message nobody is notified about is easy to miss, so this is only ever a choice.
	silentMessages: false,
	// On: a long-press on send does nothing in stock Discord, so nothing is taken away.
	sendButtonSheet: true,
	// The sheet: a plain long-press is what people expect; the swipe is an opt-in shortcut.
	sendButtonMode: 'sheet',
	sheetThisMessage: true,
	sheetSwitches: true,
	sheetMoreSettings: true,
	applyToEdits: true,
	debugLogging: false,
}
