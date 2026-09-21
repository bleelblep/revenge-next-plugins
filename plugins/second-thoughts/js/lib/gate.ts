/**
 * Tier 1's local gate.
 *
 * The model is only worth paying for on a draft that already looks like trouble. This scores a
 * draft from cheap local signals and the caller spends a call only when the score clears the
 * user's sensitivity setting. With the default threshold this fires on a handful of messages a
 * day rather than on every one, which is the difference between a plugin that costs cents and
 * one that costs real money.
 *
 * Nothing here decides to hold a message. A high score buys a second opinion, nothing more.
 */

import { sendsWithin } from './state'
import { analyseTypos } from './typos'

export interface GateResult {
	score: number
	/** Why it scored, for the debug log and the settings page's test box. */
	signals: string[]
}

/**
 * Drafts that read as someone reaching out about their own distress. This list exists to be
 * *excluded*, always, ahead of every other check: a person telling a friend they are struggling
 * must never be met with a bot asking whether they are sure. It bypasses the gate, the model and
 * the modal entirely.
 */
const REACHING_OUT = [
	/\bi (really )?(need|could use) (to talk|someone|help|a friend)\b/i,
	/\bi('?m| am) (really )?(not ok|not okay|struggling|depressed|scared|frightened|lonely)\b/i,
	/\bi (feel|am feeling) (really )?(awful|terrible|hopeless|worthless|empty|low)\b/i,
	/\b(i want to die|i don'?t want to be here|kill myself|end it all|self[- ]harm)\b/i,
	/\bcan (we|i) talk\b/i,
	/\bare you (free|around|there)\b.{0,40}\b(talk|chat)\b/i,
]

export function isReachingOut(text: string): boolean {
	return REACHING_OUT.some(pattern => pattern.test(text))
}

/** Aimed squarely at a person. These are the phrases a row escalates through. */
const ESCALATION: Array<[RegExp, number, string]> = [
	[/\bk+y+s+\b/i, 4, 'kys'],
	[/\bfuck (you|off|right off)\b/i, 3, 'fuck-you'],
	[/\bshut (the fuck )?up\b/i, 3, 'shut-up'],
	[/\byou'?re? (such |so )?(a|an) (fucking )?\w+/i, 2, 'youre-a'],
	[/\byou (always|never)\b/i, 2, 'always-never'],
	[
		/\bare you (stupid|dumb|thick|serious|fucking kidding|for real)\b/i,
		2,
		'are-you',
	],
	[/\b(nobody|no one) (cares|asked)\b/i, 2, 'nobody-asked'],
	[/\bgrow up\b/i, 1, 'grow-up'],
	[/\bdon'?t (ever )?(talk to|message|dm) me\b/i, 2, 'dont-talk'],
	[/\bi'?m done (with|talking)\b/i, 1, 'im-done'],
	[/\bwhat('?s| is) wrong with you\b/i, 2, 'whats-wrong'],
]

const PROFANITY =
	/\b(fuck(ing|ed|er|s)?|shit(ty|e)?|cunt|bitch|bastard|dick(head)?|arsehole|asshole|prick|wanker|twat|retard(ed)?)\b/i

const SECOND_PERSON = /\b(you|your|you'?re|u|ur|yall|y'?all)\b/i

/** Oversharing, in the factual sense. Distress is handled by REACHING_OUT and never scored. */
const DISCLOSURE: Array<[RegExp, number, string]> = [
	[
		/\b(my|our) (salary|wage|income|rent|mortgage|overdraft|debt)\b/i,
		2,
		'money',
	],
	[
		/\bi (get|earn|make) \$?\d[\d,.]*(k| a (week|month|year)| per (week|month|year))\b/i,
		2,
		'earnings',
	],
	[
		/\b(my|our) (diagnosis|medication|therapist|psychiatrist|prescription)\b/i,
		2,
		'medical',
	],
	[/\bdon'?t tell (anyone|him|her|them)\b/i, 2, 'secondhand-secret'],
	[/\bbetween (you and me|us)\b/i, 1, 'in-confidence'],
	[/\b(internal|confidential|under embargo|nda)\b/i, 2, 'work-confidential'],
]

// Letters only. `\w` also matched digits, so a card number scored as a stretched word.
const REPEATED_CHAR = /([a-z])\1{2,}/gi
const SHOUTED_WORD = /\b[A-Z]{4,}\b/g

function capsRatio(text: string): number {
	let upper = 0
	let letters = 0
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i)
		if (code >= 65 && code <= 90) {
			upper++
			letters++
		} else if (code >= 97 && code <= 122) {
			letters++
		}
	}
	return letters >= 12 ? upper / letters : 0
}

export interface GateOptions {
	checkHostile: boolean
	checkDrunk: boolean
	checkOversharing: boolean
	/** Local hour, injected so the scorer stays testable. */
	hour: number
}

export function scoreDraft(text: string, options: GateOptions): GateResult {
	const signals: string[] = []
	let score = 0

	const add = (points: number, name: string) => {
		score += points
		signals.push(`${name}+${points}`)
	}

	if (options.checkHostile) {
		for (const [pattern, points, name] of ESCALATION) {
			if (pattern.test(text)) add(points, name)
		}

		const swears = PROFANITY.test(text)
		if (swears && SECOND_PERSON.test(text)) add(3, 'profanity-at-you')
		else if (swears) add(1, 'profanity')

		const caps = capsRatio(text)
		if (caps > 0.8) add(2, 'shouting')
		else if (caps > 0.6) add(1, 'caps')

		if (/[!?]{6,}/.test(text)) add(2, 'punctuation')
		else if (/[!?]{3,}/.test(text)) add(1, 'punctuation')

		if ((text.match(SHOUTED_WORD) ?? []).length >= 2) add(1, 'shouted-words')

		if (text.length > 800) add(2, 'wall-of-text')
		else if (text.length > 400) add(1, 'long')

		// Three messages inside ten seconds is someone typing faster than they are thinking.
		if (sendsWithin(10_000) >= 3) add(2, 'burst')
	}

	if (options.checkDrunk) {
		const late = options.hour >= 23 || options.hour <= 4

		// Stretched words scale. One is a flourish; three is someone leaning on the keyboard.
		REPEATED_CHAR.lastIndex = 0
		const stretches = (text.match(REPEATED_CHAR) ?? []).length
		if (stretches >= 3) add(3, 'stretched-words')
		else if (stretches === 2) add(2, 'stretched-words')
		else if (stretches === 1) add(1, 'stretched-words')

		if (/\bi'?m (so )?(drunk|pissed|wasted|hammered|smashed)\b/i.test(text))
			add(2, 'stated-drunk')

		// The real tell, and the one this check used to miss entirely: typing that has come
		// apart. `stated-drunk` only fires when you type the word "drunk", which is the one case
		// nobody needs a plugin for. See the note at the top of `typos.ts`.
		const typos = analyseTypos(text)
		if (typos.suspects >= 2) {
			if (typos.ratio > 0.25) add(3, 'typos')
			else if (typos.ratio > 0.12) add(2, 'typos')
		}
		if (typos.mashed) add(1, 'mashed-words')
		if (typos.stutter) add(1, 'stutter')

		// The hour on its own means nothing -- plenty of people are sober and articulate at 2am.
		// It only counts once something else has already scored.
		if (late && score > 0) add(1, 'late')
	}

	if (options.checkOversharing) {
		for (const [pattern, points, name] of DISCLOSURE) {
			if (pattern.test(text)) add(points, name)
		}
	}

	return { score, signals }
}
