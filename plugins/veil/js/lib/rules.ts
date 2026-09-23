/**
 * The free layer: rules that decide instantly, on the device, with no network and no cost.
 *
 * Checked before the AI layer on every row, and a match here means the message is never sent for
 * checking at all.
 */

import { channelName, settings, userName } from './state'

function escape(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Text as it reads, not as it is encoded, so a disguise does not slip past:
 *
 * - NFKC folds "fancy" letters (mathematical bold, fullwidth, circled) and ligatures into plain
 *   ones, so those spellings of a word still match it.
 * - NFKD, then dropping combining marks, makes an accented letter match its plain one.
 * - Zero-width characters and soft hyphens are removed, so a word split by one still matches.
 *
 * `normalize` needs Intl, which Discord's Hermes has; without it the text is only stripped.
 */
export function normalize(text: string): string {
	let out = text.replace(
		/[­᠎​‌‍‎‏⁠⁡⁢⁣⁤﻿]/g,
		'',
	)
	try {
		out = out
			.normalize('NFKC')
			.normalize('NFKD')
			.replace(/[̀-ͯ]/g, '')
	} catch {
		/* no Intl: stripped only */
	}
	return out.toLowerCase()
}

/**
 * Common endings, so "spoiler" also catches "spoilers" and "spoiler's", and "leak" catches
 * "leaked" and "leaking". The start of the word is still a boundary, so "art" does not blur
 * "party" -- though it does blur "arts".
 */
const ENDINGS = "(?:s|es|'s|’s|ed|d|ing|er|ers)?"

/**
 * Compiled once per distinct word list, not per row: rows are generated in bursts of dozens, and
 * the list only changes when the user edits it.
 */
let compiledFor = ''
let compiled: Array<{ word: string; pattern: RegExp }> = []

/** Up to two junk characters between letters: "f.i.n.a.l.e", "f i n a l e", "f-i-n-a-l-e". */
const GAP = '[\\s\\W_]{0,2}'

function patterns(words: string[], loose: boolean) {
	const key = `${loose ? 'loose' : 'exact'}\u0000${words.join('\u0000')}`
	if (key !== compiledFor) {
		compiledFor = key
		compiled = words
			.map(word => word.trim())
			.filter(Boolean)
			.map(word => {
				const plain = normalize(word)
				// Boundaries only where the word itself starts or ends with a word character, so
				// "c++" and "#spoiler" still match.
				const start = /^\w/.test(plain) ? '\\b' : ''
				const end = /\w$/.test(plain) ? `${ENDINGS}\\b` : ''
				// Loose: the same word, but tolerating junk between its characters. The trailing
				// boundary is dropped, since the gaps already break one.
				const body = loose
					? plain.split('').map(escape).join(GAP)
					: escape(plain)
				return {
					word,
					pattern: new RegExp(`${start}${body}${loose ? '' : end}`, 'i'),
				}
			})
	}
	return compiled
}

/** Why this message should be blurred by a local rule, or undefined. */
export function localReason(
	channelId: string,
	authorId: string | undefined,
	text: string,
): string | undefined {
	const s = settings()

	if (s.channelIds.includes(channelId))
		return `everything in ${channelName(channelId)} is blurred`
	if (authorId && s.userIds.includes(authorId))
		return `from ${userName(authorId)}`

	if (text) {
		const plain = normalize(text)
		for (const { word, pattern } of patterns(s.words, s.looseWords)) {
			if (pattern.test(plain)) return `mentions “${word}”`
		}
	}

	return undefined
}
