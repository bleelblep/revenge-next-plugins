/**
 * Typing that has come apart.
 *
 * The drunk check used to rest almost entirely on `stated-drunk`, which only fires when you type
 * the word "drunk" -- the one case nobody needs a plugin for. The messages that actually read as
 * drunk, "wjhy dont you evr repsond to me" and its relatives, scored zero.
 *
 * ## Why this is not a spell checker
 *
 * There is no dictionary here and there should not be: a real one is megabytes, and flagging
 * "every word I don't know" would fire on every username, game, band and in-joke in the channel.
 *
 * Instead a token is suspect only when one tiny edit -- a single adjacent-letter swap, or
 * deleting one character -- turns it into a *very common* English word. That is a narrow claim.
 * "repsond" is one swap from "respond" and "wjhy" is one deletion from "why", while a username,
 * a piece of slang or a game term is almost never one edit from the top two hundred words of
 * English. Real words are never flagged, because the check exits early on anything already in
 * the list.
 *
 * The deliberate spellings of chat -- "dont", "youre", "gonna", "tbh" -- are exempted outright.
 * Dropping an apostrophe is not a sign of anything except typing on a phone.
 */

/**
 * The target set. Two jobs: these are the words an edit has to land on, and a token already in
 * here is never suspect. That second job is why collision pairs matter -- "form" is one swap
 * from "from", so leaving "form" out would flag it every time someone filled one in.
 */
const COMMON = new Set([
	'the',
	'and',
	'you',
	'that',
	'was',
	'for',
	'are',
	'with',
	'his',
	'her',
	'they',
	'this',
	'have',
	'from',
	'form',
	'one',
	'had',
	'but',
	'not',
	'what',
	'all',
	'were',
	'when',
	'your',
	'can',
	'said',
	'there',
	'use',
	'each',
	'which',
	'she',
	'how',
	'their',
	'will',
	'other',
	'about',
	'out',
	'many',
	'then',
	'them',
	'these',
	'some',
	'would',
	'make',
	'like',
	'him',
	'into',
	'time',
	'has',
	'look',
	'two',
	'more',
	'write',
	'see',
	'number',
	'way',
	'could',
	'people',
	'than',
	'first',
	'water',
	'been',
	'call',
	'who',
	'oil',
	'its',
	'now',
	'find',
	'long',
	'down',
	'day',
	'did',
	'get',
	'come',
	'made',
	'may',
	'part',
	'over',
	'new',
	'sound',
	'take',
	'only',
	'little',
	'work',
	'know',
	'place',
	'year',
	'live',
	'back',
	'give',
	'most',
	'very',
	'after',
	'thing',
	'our',
	'just',
	'name',
	'good',
	'sentence',
	'man',
	'think',
	'say',
	'great',
	'where',
	'help',
	'through',
	'much',
	'before',
	'line',
	'right',
	'too',
	'mean',
	'old',
	'any',
	'same',
	'tell',
	'boy',
	'follow',
	'came',
	'want',
	'show',
	'also',
	'around',
	'three',
	'want',
	'well',
	'even',
	'such',
	'because',
	'turn',
	'here',
	'why',
	'ask',
	'went',
	'men',
	'read',
	'need',
	'land',
	'different',
	'home',
	'move',
	'try',
	'kind',
	'hand',
	'picture',
	'again',
	'change',
	'off',
	'play',
	'spell',
	'air',
	'away',
	'animal',
	'house',
	'point',
	'page',
	'letter',
	'mother',
	'answer',
	'found',
	'study',
	'still',
	'learn',
	'should',
	'world',
	'high',
	'every',
	'near',
	'add',
	'food',
	'between',
	'own',
	'below',
	'country',
	'plant',
	'last',
	'school',
	'father',
	'keep',
	'tree',
	'never',
	'start',
	'city',
	'earth',
	'eye',
	'light',
	'thought',
	'head',
	'under',
	'story',
	'saw',
	'left',
	'few',
	'while',
	'along',
	'might',
	'close',
	'something',
	'seem',
	'next',
	'hard',
	'open',
	'example',
	'begin',
	'life',
	'always',
	'those',
	'both',
	'paper',
	'together',
	'got',
	'group',
	'often',
	'run',
	'important',
	'until',
	'children',
	'side',
	'feet',
	'car',
	'mile',
	'night',
	'walk',
	'white',
	'sea',
	'began',
	'grow',
	'took',
	'river',
	'four',
	'carry',
	'state',
	'once',
	'book',
	'hear',
	'stop',
	'without',
	'second',
	'later',
	'miss',
	'idea',
	'enough',
	'eat',
	'face',
	'watch',
	'far',
	'really',
	'almost',
	'let',
	'above',
	'girl',
	'sometimes',
	'mountain',
	'cut',
	'young',
	'talk',
	'soon',
	'list',
	'song',
	'being',
	'leave',
	'family',
	'respond',
	'message',
	'friend',
	'please',
	'sorry',
	'love',
	'hate',
	'stupid',
	'going',
	'doing',
	'saying',
	'coming',
	'trying',
	'make',
	'point',
	'end',
	'meet',
	'thing',
	'time',
	'eye',
	'hand',
	'week',
	'month',
	'hurt',
	'game',
	'update',
	'build',
	'send',
	'fill',
	'wait',
	'sleep',
	'drink',
	// Collision pairs. Each of these is one edit from another word on this list, so leaving any
	// of them out would make an ordinary word permanently suspect.
	'angle',
	'angel',
	'quiet',
	'quite',
	'trial',
	'trail',
	'united',
	'untied',
	'causal',
	'casual',
	'dairy',
	'diary',
	'board',
	'broad',
	'brake',
	'break',
	'salt',
	'slat',
	'lats',
	'least',
	'steal',
	'stale',
	'tales',
	'least',
	'slate',
	'later',
	'alter',
	'alert',
	'thier',
	'their',
	'wont',
	'want',
	'went',
	'want',
	'tired',
	'tried',
	'fired',
	'fried',
	'sacred',
	'scared',
	'married',
	'admired',
	'dessert',
	'desert',
	'lose',
	'close',
	'loose',
	'those',
])

/**
 * How chat is actually written. None of these are typos, and several are one edit from a word in
 * COMMON, so without this list the check would fire on every second message.
 */
const CHAT = new Set([
	'im',
	'ive',
	'ill',
	'dont',
	'doesnt',
	'didnt',
	'cant',
	'wont',
	'wouldnt',
	'couldnt',
	'shouldnt',
	'isnt',
	'arent',
	'wasnt',
	'werent',
	'hasnt',
	'havent',
	'hadnt',
	'youre',
	'youve',
	'youll',
	'theyre',
	'theyve',
	'weve',
	'were',
	'thats',
	'whats',
	'lets',
	'hes',
	'shes',
	'theres',
	'heres',
	'ones',
	'gonna',
	'wanna',
	'gotta',
	'kinda',
	'sorta',
	'dunno',
	'lemme',
	'gimme',
	'doin',
	'goin',
	'nothin',
	'somethin',
	'tryna',
	'finna',
	'prolly',
	'def',
	'rly',
	'srsly',
	'tbh',
	'ngl',
	'imo',
	'imho',
	'idk',
	'idc',
	'lmao',
	'lmfao',
	'rofl',
	'brb',
	'afk',
	'bruh',
	'fr',
	'ong',
	'nah',
	'yeah',
	'yea',
	'sup',
	'lol',
	'omg',
	'wtf',
	'wth',
	'ffs',
	'smh',
	'pls',
	'plz',
	'thx',
	'cuz',
	'tho',
	'rn',
	'ur',
	'ok',
	'okay',
	'yep',
	'nope',
	'hmm',
	'huh',
	'oof',
	'yikes',
	'based',
	'cringe',
	'pog',
	'poggers',
	'sus',
	'bet',
	'fam',
	'lowkey',
	'highkey',
	'deadass',
	'frfr',
	'istg',
	'iirc',
	'afaik',
	' etc',
])

const TOKEN = /[a-z']+/g

/** Every single adjacent-letter swap of a word. "teh" yields "eth" and "the". */
function transpositions(word: string): string[] {
	const out: string[] = []
	for (let i = 0; i < word.length - 1; i++) {
		if (word[i] === word[i + 1]) continue
		out.push(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2))
	}
	return out
}

/** Every single-character deletion. "wjhy" yields "jhy", "why", "wjy" and "wjh". */
function deletions(word: string): string[] {
	const out: string[] = []
	for (let i = 0; i < word.length; i++)
		out.push(word.slice(0, i) + word.slice(i + 1))
	return out
}

/**
 * Inflected forms of listed words.
 *
 * Without this every plural is a false positive, because deleting the trailing "s" from "starts"
 * lands on "start". The same goes for "-ed", "-ing", "-er" and "-ly". Stripping a suffix and
 * finding a real word means the token is a real word too, not a slip.
 */
const SUFFIXES = [
	'ies',
	'ing',
	'ers',
	'est',
	'es',
	'ed',
	'er',
	'ly',
	's',
	'd',
	'y',
]

function isInflection(word: string): boolean {
	for (const suffix of SUFFIXES) {
		if (!word.endsWith(suffix) || word.length - suffix.length < 2) continue
		const stem = word.slice(0, -suffix.length)
		if (COMMON.has(stem) || CHAT.has(stem)) return true
		// "tries" -> "tri" -> "try", "making" -> "mak" -> "make"
		if (COMMON.has(`${stem}e`) || COMMON.has(`${stem}y`)) return true
		// "stopped" -> "stopp" -> "stop"
		if (stem.length > 2 && stem[stem.length - 1] === stem[stem.length - 2]) {
			if (COMMON.has(stem.slice(0, -1))) return true
		}
	}
	return false
}

function isSuspect(word: string): boolean {
	// Anything real, or anything anyone types on purpose, is done here.
	if (COMMON.has(word) || CHAT.has(word)) return false
	if (isInflection(word)) return false

	for (const candidate of transpositions(word))
		if (COMMON.has(candidate)) return true
	for (const candidate of deletions(word))
		if (COMMON.has(candidate)) return true
	return false
}

export interface TypoResult {
	/** Tokens that are one edit from a common word. */
	suspects: number
	/** Tokens considered at all (three letters or more). */
	considered: number
	ratio: number
	/** Two words mashed together with no space, as one long token. */
	mashed: boolean
	/** The same word twice in a row. */
	stutter: boolean
}

export function analyseTypos(text: string): TypoResult {
	const lower = text.toLowerCase()
	TOKEN.lastIndex = 0
	const tokens = lower.match(TOKEN) ?? []

	let suspects = 0
	let considered = 0
	let mashed = false

	for (const raw of tokens) {
		const word = raw.replace(/'/g, '')
		if (word.length > 18) mashed = true
		// Two letters is texting, not a slip, and short tokens collide with everything.
		if (word.length < 3) continue
		considered++
		if (isSuspect(word)) suspects++
	}

	return {
		suspects,
		considered,
		ratio: considered ? suspects / considered : 0,
		mashed,
		stutter: /\b([a-z]{2,})\s+\1\b/i.test(lower),
	}
}
