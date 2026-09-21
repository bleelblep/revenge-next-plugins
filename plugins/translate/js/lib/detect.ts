/**
 * A cheap guess at whether a message is already in your language.
 *
 * Auto-translate has one problem the manual button does not: it sees every message, and the
 * services only report a source language *after* they have translated. Sending everything to be
 * translated in order to find out whether it needed translating would be slow, would burn
 * MyMemory's daily quota in an afternoon, and would look a lot like abuse to the other three.
 *
 * So this filters locally first. It does not need to identify the language — only to answer
 * "could this plausibly already be the target?", and to be wrong in the safe direction. A false
 * "not the target" costs one request that comes back saying the same thing. A false "is the
 * target" means a message silently does not get translated, which is the outcome worth avoiding,
 * so every uncertain case answers no.
 */

/**
 * Scripts that settle the question on sight. If the target is English and the text is Cyrillic,
 * no word list is needed.
 */
const SCRIPTS: Array<[RegExp, string[]]> = [
	[/[Ѐ-ӿ]/, ['ru', 'uk', 'bg', 'sr', 'mk', 'be']],
	[/[一-鿿]/, ['zh', 'ja']],
	[/[぀-ゟ゠-ヿ]/, ['ja']],
	[/[가-힯]/, ['ko']],
	[/[؀-ۿ]/, ['ar', 'fa', 'ur']],
	[/[֐-׿]/, ['he']],
	[/[฀-๿]/, ['th']],
	[/[ऀ-ॿ]/, ['hi', 'mr', 'ne']],
	[/[Ⴀ-ჿ]/, ['ka']],
	[/[Ͱ-Ͽ]/, ['el']],
]

/**
 * Function words, which are the most reliable cheap signal for a Latin-script language: they are
 * short, extremely common, and mostly distinct between languages.
 */
const MARKERS: Record<string, string[]> = {
	en: [
		'the',
		'and',
		'is',
		'are',
		'you',
		'that',
		'this',
		'with',
		'for',
		'have',
		'not',
		'what',
		'was',
		'but',
		'i',
	],
	es: [
		'el',
		'la',
		'los',
		'las',
		'que',
		'de',
		'es',
		'y',
		'no',
		'un',
		'una',
		'por',
		'con',
		'para',
		'como',
	],
	fr: [
		'le',
		'la',
		'les',
		'que',
		'de',
		'et',
		'est',
		'un',
		'une',
		'pas',
		'pour',
		'dans',
		'avec',
		'sur',
		'je',
	],
	de: [
		'der',
		'die',
		'das',
		'und',
		'ist',
		'nicht',
		'ein',
		'eine',
		'mit',
		'auf',
		'für',
		'ich',
		'du',
		'zu',
		'den',
	],
	pt: [
		'o',
		'a',
		'os',
		'as',
		'que',
		'de',
		'é',
		'não',
		'um',
		'uma',
		'para',
		'com',
		'por',
		'eu',
		'você',
	],
	it: [
		'il',
		'la',
		'che',
		'di',
		'e',
		'non',
		'un',
		'una',
		'per',
		'con',
		'sono',
		'ho',
		'più',
		'come',
		'io',
	],
	nl: [
		'de',
		'het',
		'een',
		'en',
		'is',
		'niet',
		'van',
		'dat',
		'ik',
		'je',
		'met',
		'voor',
		'op',
		'te',
		'zijn',
	],
	id: [
		'yang',
		'dan',
		'di',
		'itu',
		'ini',
		'tidak',
		'saya',
		'ada',
		'untuk',
		'dengan',
		'dari',
		'ke',
		'sudah',
	],
	tr: [
		'bir',
		've',
		'bu',
		'için',
		'ile',
		'ben',
		'çok',
		'ne',
		'var',
		'yok',
		'daha',
		'ama',
		'gibi',
	],
	pl: [
		'nie',
		'jest',
		'to',
		'się',
		'na',
		'w',
		'że',
		'do',
		'ale',
		'jak',
		'co',
		'tak',
		'jestem',
	],
	mi: [
		'te',
		'ngā',
		'he',
		'ki',
		'i',
		'kei',
		'me',
		'kia',
		'ana',
		'rā',
		'nei',
		'mō',
	],
}

/**
 * Splits on whitespace and punctuation rather than matching letters with `\p{L}`. Unicode property
 * escapes are not something to bet on under Hermes, and a regex literal it cannot parse throws
 * while the bundle is being evaluated -- taking the whole plugin down at preInit, not just this
 * function.
 */
const SEPARATORS = /[\s.,!?;:"()[\]{}<>*_~`|/-]+/

function baseCode(code: string): string {
	return code.toLowerCase().split(/[-_]/)[0]
}

/**
 * True only when the text confidently looks like it is already in `target`.
 *
 * Deliberately conservative: short messages, emoji-only messages and anything with no clear
 * signal all answer false, because a wasted request is cheaper than a message that silently
 * stays untranslated.
 */
export function looksLikeTarget(text: string, target: string): boolean {
	const trimmed = typeof text === 'string' ? text.trim() : ''
	if (!trimmed) return true

	const code = baseCode(target)

	// A script the target does not use settles it immediately, in the useful direction.
	for (const [pattern, languages] of SCRIPTS) {
		if (pattern.test(trimmed)) return languages.includes(code)
	}

	const markers = MARKERS[code]
	if (!markers) return false

	const words = trimmed
		.toLowerCase()
		.split(SEPARATORS)
		.filter(w => w && w.length <= 12)
	// Too little to judge. One matching word out of three proves nothing in any language.
	if (words.length < 4) return false

	const set = new Set(markers)
	let hits = 0
	for (const word of words) if (set.has(word)) hits++

	// Two function words, or a fifth of a short message, is about where guessing stops.
	return hits >= 2 || hits / words.length >= 0.2
}
