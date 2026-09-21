/**
 * Tier 0: the half of the plugin that needs no model, no key and no network.
 *
 * Everything here is a pattern match over the draft. It runs on every send, costs nothing, and
 * is the reason the plugin is useful before DeepSeek is ever configured. The patterns are chosen
 * for precision over recall: a credential that slips through is the old behaviour, while a false
 * positive holds back a message the user meant to send, which is the failure that gets a plugin
 * uninstalled.
 */

import type { Category } from '../types'

export interface PatternHit {
	category: Extract<Category, 'credentials' | 'personal'>
	reason: string
}

/**
 * Credentials. Every one of these is a shape that only ever appears by accident in chat --
 * nobody types an AWS access key ID conversationally.
 */
const CREDENTIALS: Array<[RegExp, string]> = [
	[/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'a private key'],
	[
		/\b[MNO][A-Za-z\d_-]{23,27}\.[A-Za-z\d_-]{6}\.[A-Za-z\d_-]{27,}\b/,
		'a Discord token',
	],
	[/\bsk-ant-[A-Za-z0-9_-]{20,}/, 'an Anthropic API key'],
	[/\bsk-(proj-)?[A-Za-z0-9_-]{20,}/, 'an API key'],
	[/\bgh[pousr]_[A-Za-z0-9]{30,}\b/, 'a GitHub token'],
	[/\bgithub_pat_[A-Za-z0-9_]{50,}\b/, 'a GitHub token'],
	[/\bxox[baprs]-[A-Za-z0-9-]{10,}/, 'a Slack token'],
	[/\bAKIA[0-9A-Z]{16}\b/, 'an AWS access key'],
	[/\bAIza[0-9A-Za-z_-]{35}\b/, 'a Google API key'],
	[/\bsk_live_[A-Za-z0-9]{20,}\b/, 'a Stripe live key'],
	[/\bglpat-[A-Za-z0-9_-]{20,}\b/, 'a GitLab token'],
	[
		/\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
		'a signed token',
	],
	[/\bnpm_[A-Za-z0-9]{36}\b/, 'an npm token'],
	[/\bhttps?:\/\/[^\s]*:[^\s@]{6,}@/, 'a URL with a password in it'],
	// Looser, so it sits last and speaks more vaguely.
	[
		/\b(pass(word|wd)?|api[_-]?key|secret|token|auth)\s*[:=]\s*["']?\S{8,}/i,
		'what looks like a credential',
	],
]

/**
 * Personal details. Off by default, and scoped to servers by default, because sharing these is
 * usually intentional -- the interesting case is pasting one into a channel with five thousand
 * people in it rather than into a DM.
 */
const PERSONAL: Array<[RegExp, string]> = [
	[/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, 'an email address'],
	// Case-insensitive on purpose: nobody capitalises an address in chat. This was written as
	// `[A-Z][a-z]+` first, so "123 fake street" -- the way anyone actually types it -- sailed
	// straight through while "123 Fake Street" was caught.
	//
	// At least one word has to sit between the number and the street type, so "1 st place" and
	// its neighbours cannot match. Street types that double as ordinary English words (way,
	// place, close, court) are left out rather than risk "no way" scoring as an address.
	// `dr` and `lane` went the same way after "took me 3 hours dr" and "3 mid lane": two
	// letters of doctor and a MOBA callout are both commoner in chat than the streets are.
	//
	// The stoplist covers the other shape that kept slipping through: a count followed by a
	// unit, as in "i waited 2 hours st" or "he has 2 hours drive home". A real street name
	// is one or two words immediately before the type, never a counting noun.
	[
		/\b\d{1,5}[a-z]?\s+(?!(?:hours?|hrs?|minutes?|mins?|seconds?|secs?|days?|weeks?|months?|years?|times?|people|players|kills|deaths|items|games|rounds|points|dollars|bucks|more|other|out|of)\b)([a-z'-]+\s+){1,2}(street|st|road|rd|avenue|ave|drive|crescent|cres|terrace|tce|boulevard|blvd|highway|hwy|parade|pde|quay)\b/i,
		'a street address',
	],
]

/** Discord snowflakes are 17-20 digits and are all over normal conversation. */
const SNOWFLAKE = /^\d{17,20}$/

/**
 * Phone numbers get their own pass rather than a regex in the table above: the naive pattern
 * matches snowflakes, timestamps, version strings and dice rolls. Requiring either a leading `+`
 * or internal separators removes nearly all of that.
 */
const PHONE =
	/(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?|\d{2,4}[\s.-])\d{3,4}[\s.-]?\d{3,4}\b/g

function looksLikePhone(text: string): boolean {
	PHONE.lastIndex = 0
	for (const match of text.match(PHONE) ?? []) {
		const digits = match.replace(/\D/g, '')
		if (digits.length < 8 || digits.length > 15) continue
		if (SNOWFLAKE.test(digits)) continue
		return true
	}
	return false
}

/** Runs of 13-19 digits that pass Luhn. The checksum is what makes this usable at all. */
const CARDISH = /\b(?:\d[ -]?){13,19}\b/g

function luhn(digits: string): boolean {
	let sum = 0
	let double = false
	for (let i = digits.length - 1; i >= 0; i--) {
		let value = digits.charCodeAt(i) - 48
		if (double) {
			value *= 2
			if (value > 9) value -= 9
		}
		sum += value
		double = !double
	}
	return sum % 100 === 0 ? false : sum % 10 === 0
}

function looksLikeCard(text: string): boolean {
	CARDISH.lastIndex = 0
	for (const match of text.match(CARDISH) ?? []) {
		const digits = match.replace(/\D/g, '')
		if (digits.length < 13 || digits.length > 19) continue
		// A snowflake that happens to pass Luhn is far likelier than a card in a chat message.
		if (SNOWFLAKE.test(digits)) continue
		if (luhn(digits)) return true
	}
	return false
}

export interface ScanOptions {
	checkCredentials: boolean
	checkPersonalDetails: boolean
	/** False in a DM when the user has scoped personal details to servers only. */
	personalDetailsApply: boolean
}

/**
 * The whole of tier 0. Returns the first hit, or undefined when the draft is clean.
 * Order matters: credentials outrank personal details, because they are the more expensive leak.
 */
export function scanPatterns(
	text: string,
	options: ScanOptions,
): PatternHit | undefined {
	if (options.checkCredentials) {
		for (const [pattern, what] of CREDENTIALS) {
			if (pattern.test(text)) {
				return { category: 'credentials', reason: `This contains ${what}.` }
			}
		}
		// A card number is a credential in every sense that matters here.
		if (looksLikeCard(text)) {
			return {
				category: 'credentials',
				reason: 'This contains what looks like a card number.',
			}
		}
	}

	if (options.checkPersonalDetails && options.personalDetailsApply) {
		for (const [pattern, what] of PERSONAL) {
			if (pattern.test(text))
				return { category: 'personal', reason: `This contains ${what}.` }
		}
		if (looksLikePhone(text)) {
			return {
				category: 'personal',
				reason: 'This contains what looks like a phone number.',
			}
		}
	}

	return undefined
}
