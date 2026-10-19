import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cleanPronounDb, cleanPronouns, parseExtra } from '../js/lib/validate'

const ON = { anyAll: true, extra: [] as string[] }
const OFF = { anyAll: false, extra: [] as string[] }

/** [field as people write it, what the badge should show (undefined = no badge)] */
type Case = [string, string | undefined]

function check(name: string, cases: Case[], options = ON) {
	test(name, () => {
		const failures: string[] = []
		for (const [input, want] of cases) {
			const got = cleanPronouns(input, options)
			if (got !== want) failures.push(`${JSON.stringify(input)} -> ${JSON.stringify(got)}, want ${JSON.stringify(want)}`)
		}
		assert.deepEqual(failures, [], `${failures.length} of ${cases.length} wrong:\n${failures.join('\n')}`)
	})
}

check('standard pronouns, plain', [
	['he/him', 'he/him'],
	['she/her', 'she/her'],
	['they/them', 'they/them'],
	['it/its', 'it/its'],
	['he/they', 'he/they'],
	['she/they', 'she/they'],
	['they/he', 'they/he'],
	['they/she', 'they/she'],
	['he/she', 'he/she'],
	['she/he', 'she/he'],
	['he/him/his', 'he/him/his'],
	['she/her/hers', 'she/her/hers'],
	['they/them/theirs', 'they/them/theirs'],
	['he/him/his/himself', 'he/him/his/himself'],
	['they/them/their/theirs/themself', 'they/them/their/theirs/themself'],
	['he/they/it', 'he/they/it'],
	['she/they/it', 'she/they/it'],
	['it/they', 'it/they'],
	['they/it', 'they/it'],
	['he/it', 'he/it'],
	['she/it', 'she/it'],
	['it/he', 'it/he'],
	['him/her', 'him/her'],
	['his/hers', 'his/hers'],
	['one/one\'s', "one/one's"],
	['they', 'they'],
	['he', 'he'],
	['she', 'she'],
	['them', 'them'],
	['he him', 'he/him'],
	['she her', 'she/her'],
	['they them', 'they/them'],
	['he him his', 'he/him/his'],
])

check('standard pronouns, written differently', [
	['He/Him', 'He/Him'],
	['HE/HIM', 'HE/HIM'],
	['She/Her', 'She/Her'],
	['THEY/THEM', 'THEY/THEM'],
	['he / him', 'he/him'],
	['she / her', 'she/her'],
	['they /them', 'they/them'],
	['he/ him', 'he/him'],
	['(he/him)', 'he/him'],
	['[she/her]', 'she/her'],
	['{they/them}', 'they/them'],
	['<he/him>', 'he/him'],
	['~ she/her ~', 'she/her'],
	['- they/them -', 'they/them'],
	['"he/him"', 'he/him'],
	["'she/her'", 'she/her'],
	['he/him.', 'he/him'],
	['she/her!', 'she/her'],
	['they/them :)', 'they/them'],
	['he/him :3', 'he/him'],
	['she/her <3', 'she/her'],
	['they/them ^^', 'they/them'],
	['  he/him  ', 'he/him'],
	['he//him', 'he/him'],
	['she\\her', 'she/her'],
	['they∕them', 'they/them'],
	['he／him', 'he/him'],
	['pronouns: he/him', 'he/him'],
	['Pronouns: she/her', 'she/her'],
	['prns: they/them', 'they/them'],
	['he/him pronouns', 'he/him'],
	['pronouns: they', 'they'],
	['they/them pronouns only', 'they/them'],
])

check('emoji, flags and decoration', [
	['he/him 🌈', 'he/him'],
	['she/her 🏳️‍⚧️', 'she/her'],
	['they/them 🏳️‍🌈', 'they/them'],
	['🌸 she/her 🌸', 'she/her'],
	['✨ they/them ✨', 'they/them'],
	['he/him 🖤', 'he/him'],
	['she/her ♡', 'she/her'],
	['he/him ☆', 'he/him'],
	['⋆ she/her ⋆', 'she/her'],
	['꒰ they/them ꒱', 'they/them'],
	['she/her ୨୧', 'she/her'],
	['he/him 🎮', 'he/him'],
	['🦋', undefined],
	['🏳️‍🌈', undefined],
	['♡', undefined],
	['✨✨✨', undefined],
	['she 🌸', 'she'],
	['they ✨', 'they'],
	['he ♡ him', 'he/him'],
])

check('pronouns next to age, star sign and other bio bits', [
	['he/him | 19', 'he/him'],
	['she/her | 21 | libra', 'she/her'],
	['they/them • 17 • minor', 'they/them'],
	['he/him · 20', 'he/him'],
	['she/her, 18+', 'she/her'],
	['he/him | taken', 'he/him'],
	['she/her | taken by @someone', 'she/her'],
	['they/them | autistic', 'they/them'],
	['he/him | uk', 'he/him'],
	['she/her | est', 'she/her'],
	['19 | he/him', 'he/him'],
	['minor | she/her', 'she/her'],
	['libra ♎ she/her', 'she/her'],
	['he/him lover of cats', 'he/him'],
	['he/him and proud', 'he/him'],
	['she/her (ask me)', 'she/her'],
	['he/him, ask for others', 'he/him'],
	['they/them but he/him is ok', 'they/them, he/him'],
	['she/her or they/them', 'she/her, they/them'],
	['he/him and they/them', 'he/him, they/them'],
	['he/they, prefer he', 'he/they'],
	['she/they (mostly she)', 'she/they'],
	['he/him she/her', 'he/him, she/her'],
	['she/her he/him they/them', 'she/her, he/him, they/them'],
	['he/him, she/her', 'he/him, she/her'],
	['he/him; they/them', 'he/him, they/them'],
	['he/him + they/them', 'he/him, they/them'],
	['he/him & they/them', 'he/him, they/them'],
	['he/him\nthey/them', 'he/him, they/them'],
	['she/her | 19 | taken | ♡', 'she/her'],
	['they/them | 22 | 🇧🇷', 'they/them'],
	['he/him | 5\'11', 'he/him'],
	['he/him | INTJ', 'he/him'],
	['she/her - artist', 'she/her'],
	['she/her ~ artist', 'she/her'],
	['artist | they/them', 'they/them'],
])

check('neopronouns written as sets', [
	['xe/xem', 'xe/xem'],
	['xe/xem/xyr', 'xe/xem/xyr'],
	['xe/xir', 'xe/xir'],
	['ze/zir', 'ze/zir'],
	['ze/hir', 'ze/hir'],
	['zie/zir', 'zie/zir'],
	['fae/faer', 'fae/faer'],
	['fae/faer/faers', 'fae/faer/faers'],
	['ey/em', 'ey/em'],
	['ey/em/eir', 'ey/em/eir'],
	['e/em/eir', 'e/em/eir'],
	['ve/ver', 've/ver'],
	['ne/nem', 'ne/nem'],
	['per/pers', 'per/pers'],
	['ae/aer', 'ae/aer'],
	['co/cos', 'co/cos'],
	['thon/thons', 'thon/thons'],
	['shi/hir', 'shi/hir'],
	['sie/hir', 'sie/hir'],
	['ki/kin', 'ki/kin'],
	['star/stars', 'star/stars'],
	['star/starself', 'star/starself'],
	['bun/buns', 'bun/buns'],
	['mew/mews', 'mew/mews'],
	['pup/pups', 'pup/pups'],
	['void/voids', 'void/voids'],
	['kit/kits', 'kit/kits'],
	['bee/bees', 'bee/bees'],
	['fox/foxes', 'fox/foxes'],
	['cat/cats', 'cat/cats'],
	['cat/catself', 'cat/catself'],
	['vae/vaer', 'vae/vaer'],
	['nya/nyan', 'nya/nyan'],
	['he/xe', 'he/xe'],
	['she/fae', 'she/fae'],
	['they/xe/it', 'they/xe/it'],
	['it/cat', 'it/cat'],
	['he/him/fox', 'he/him/fox'],
	['xe', 'xe'],
	['fae', 'fae'],
	['ze', 'ze'],
	['xe/xem | 19', 'xe/xem'],
	['🌙 fae/faer 🌙', 'fae/faer'],
	['XE/XEM', 'XE/XEM'],
	['Fae/Faer', 'Fae/Faer'],
])

check('any and all', [
	['any', 'any'],
	['any pronouns', 'any'],
	['Any pronouns', 'Any'],
	['any/all', 'any/all'],
	['all/any', 'all/any'],
	['all pronouns', 'all'],
	['any/all pronouns', 'any/all'],
	['he/any', 'he/any'],
	['she/any', 'she/any'],
	['they/any', 'they/any'],
	['any (ask)', 'any'],
	['any pronouns | 20', 'any'],
	['any pronouns but prefer they', 'any'],
	['any questions dm me', undefined],
	['all good', undefined],
	['anything goes', undefined],
])

check('names that contain pronoun words', [
	['emperor shi hao', undefined],
	['Emperor Shi Hao', undefined],
	['Shi Hao', undefined],
	['shi', undefined],
	['Shi', undefined],
	['Ki', undefined],
	['ki adi mundi', undefined],
	['Kit Harington', undefined],
	['kit', undefined],
	['Fox Mulder', undefined],
	['fox', undefined],
	['Star', undefined],
	['star lord', undefined],
	['Bee', undefined],
	['Bee Movie fan', undefined],
	['Cat', undefined],
	['cat person', undefined],
	['Void', undefined],
	['void walker', undefined],
	['Pup', undefined],
	['bun bun', undefined],
	['Mew', undefined],
	['Nya~', undefined],
	['Yo', undefined],
	['yo yo yo', undefined],
	['Ya boi', undefined],
	['Te amo', undefined],
	['Di Maria', undefined],
	['Lu Bu', undefined],
	['Hu Tao', undefined],
	['Co-op gamer', undefined],
	['Per aspera ad astra', undefined],
	['Ne Zha', undefined],
	['Ve Day', undefined],
	['Ae', undefined],
	['Sie', undefined],
	['Thon', undefined],
	['Em', undefined],
	['E', undefined],
	['Em Watson', undefined],
	['Kin', undefined],
	['Ix', undefined],
	['Mr Fox', undefined],
	['Kitkat', undefined],
	['Star Fox', undefined],
	['Star/Fox', undefined],
	['cat/dog', undefined],
	['cat/dog lover', undefined],
	['AC/DC', undefined],
	['w/e', undefined],
	['n/a', undefined],
	['24/7', undefined],
	['50/50', undefined],
	['fox/star', undefined],
	['bee/kit', undefined],
	['shi/hao', undefined],
	['Xi Jinping', undefined],
	['Wang Shi', undefined],
	['Liu Kang', undefined],
	['Son Goku', undefined],
	['Sun Wukong', undefined],
	['the one', undefined],
	['One Piece', undefined],
	['one piece fan', undefined],
	['the one and only', undefined],
	['Her Majesty', undefined],
	['His Dark Materials', undefined],
	['his majesty', undefined],
	['Its Raining', undefined],
	['It', undefined],
	['it', undefined],
	['its', undefined],
	['her', undefined],
	['his', undefined],
	['one', undefined],
	['their', undefined],
])

check('sentences and bios with no pronouns', [
	['i love her', undefined],
	['love her', undefined],
	['ask me', undefined],
	['ask', undefined],
	['dm me', undefined],
	['use my name', undefined],
	['just call me sam', undefined],
	['no pronouns', undefined],
	['none', undefined],
	['idk', undefined],
	['idc', undefined],
	['whatever', undefined],
	['lol', undefined],
	['lol/xd', undefined],
	['ur mom', undefined],
	['your mom', undefined],
	['attack helicopter', undefined],
	['he is cool', undefined],
	['she sells sea shells', undefined],
	['they call me bob', undefined],
	['they see me rollin', undefined],
	['him and i', undefined],
	['it is what it is', undefined],
	['it\'s me mario', undefined],
	["it's over", undefined],
	['its over', undefined],
	['give it to me', undefined],
	['me/myself/i', undefined],
	['you/yours', undefined],
	['we/us', undefined],
	['i/me', undefined],
	['me', undefined],
	['gaming', undefined],
	['https://example.com', undefined],
	['discord.gg/abc', undefined],
	['@someone', undefined],
	['#1 fan', undefined],
	['19', undefined],
	['', undefined],
	['   ', undefined],
	['...', undefined],
	['?', undefined],
	['n/a', undefined],
	['ask for pronouns', undefined],
	['pronouns', undefined],
	['pronouns?', undefined],
	['my pronouns are a secret', undefined],
	['he who must not be named', undefined],
	['she devil', undefined],
	['the man himself', undefined],
	['by herself', undefined],
	['one of a kind', undefined],
	['all day every day', undefined],
	['all of them', undefined],
	['them', 'them'],
	['bee happy', undefined],
	['meow', undefined],
	['nyan cat', undefined],
	['kitty', undefined],
])

check('other languages', [
	['él/ella', undefined],
	['elle/la', undefined],
	['il/lui', undefined],
	['er/ihm', undefined],
	['sie/ihr', undefined],
	['ele/dele', undefined],
	['ela/dela', undefined],
	['hen/hen', undefined],
	['он/его', undefined],
	['彼/彼女', undefined],
	['他', undefined],
	['ele/dele | he/him', 'he/him'],
	['il/lui, he/him', 'he/him'],
	['er/ihm + he/him', 'he/him'],
])

check('any and all with the setting off', [
	['any', undefined],
	['any pronouns', undefined],
	['any/all', undefined],
	['he/any', 'he'],
	['she/her', 'she/her'],
], OFF)

test('also-allowed words count on their own', () => {
	const options = { anyAll: true, extra: parseExtra('shi, hao') }
	assert.equal(cleanPronouns('shi', options), 'shi')
	assert.equal(cleanPronouns('shi/hao', options), 'shi/hao')
	// Allowed words are still words in a name here.
	assert.equal(cleanPronouns('emperor shi hao', options), undefined)
	assert.equal(cleanPronouns('kit', { anyAll: true, extra: parseExtra('kit') }), 'kit')
})

test('PronounDB codes', () => {
	assert.equal(cleanPronounDb('it', ON), 'it')
	assert.equal(cleanPronounDb('he', ON), 'he')
	assert.equal(cleanPronounDb('he/it', ON), 'he/it')
	assert.equal(cleanPronounDb('she/they', ON), 'she/they')
	assert.equal(cleanPronounDb('any', ON), 'any')
	assert.equal(cleanPronounDb('any', OFF), undefined)
	assert.equal(cleanPronounDb('he/any', OFF), 'he')
	assert.equal(cleanPronounDb('ask', ON), undefined)
	assert.equal(cleanPronounDb('avoid', ON), undefined)
	assert.equal(cleanPronounDb('other', ON), undefined)
	assert.equal(cleanPronounDb('he/other', ON), 'he')
	assert.equal(cleanPronounDb('', ON), undefined)
})

// ---------------------------------------------------------------------------------------------
// Generated samples: every family, every ambiguous word, names and bios, crossed with the ways
// people decorate the field.
// ---------------------------------------------------------------------------------------------

/** One "subject/object" pair per family, as people write them. */
const FAMILY_SETS = [
	'he/him', 'she/her', 'they/them', 'it/its', "one/one's", 'xe/xem', 'xe/xyr', 'ze/zir', 'ze/hir',
	'zie/zim', 'fae/faer', 'ey/em', 'e/em', 've/ver', 'ne/nem', 'per/pers', 'thon/thons', 'ae/aer',
	'co/cos', 'hu/hum', 'ki/kin', 'sie/hir', 'shi/hir', 'star/stars', 'bun/buns', 'vae/vaer',
	'mew/mews', 'pup/pups', 'nya/nyan', 'void/voids', 'kit/kits', 'bee/bees', 'fox/foxes',
	'cat/cats', 'lu/lum', 'yo/yos', 'te/tem', 'di/dem', 'ya/yam', 'ix/ixs',
]

const casings = (text: string) => [text, text.toUpperCase(), text.replace(/(^|\/)(\p{L})/gu, (_, slash, letter) => slash + letter.toUpperCase())]

check(
	'every family as a slash set, in three casings',
	FAMILY_SETS.flatMap(set => casings(set).map(variant => [variant, variant] as Case)),
)

/** Ways people decorate a field around the pronouns. `$` is the pronouns. */
const DECORATIONS = [
	'$', ' $ ', '($)', '[$]', '{$}', '<$>', '~$~', '-$-', '*$*', '_$_', '"$"', '$.', '$!', '$!!', '$?',
	'$ :)', '$ :3', '$ <3', '$ ^^', '$ xD', '$ 🌈', '🌸 $ 🌸', '✨ $', '$ ✨', '$ 🏳️‍⚧️', '$ 🏳️‍🌈', '♡ $ ♡',
	'⋆｡°✩ $ ✩°｡⋆', '꒰ $ ꒱', '$ ୨୧', '$ | 19', '$ | 20 | libra', '$ • 17 • minor', '$ · 21', '$, 18+',
	'$ | taken', '19 | $', 'minor | $', '$ | autistic | 🇬🇧', '$ - artist', '$ ~ musician', 'pronouns: $',
	'Pronouns: $', 'prns: $', '$ pronouns', '$\n19', '19\n$', '$ (ask for others)', '$ | dms open',
]

const STANDARD_SETS = ['he/him', 'she/her', 'they/them', 'it/its', 'he/they', 'she/they', 'they/he', 'they/she', 'he/him/his', 'she/her/hers', 'xe/xem', 'fae/faer', 'any/all']

check(
	'every standard set in every decoration',
	STANDARD_SETS.flatMap(set => DECORATIONS.map(decoration => [decoration.replace('$', set), set] as Case)),
)

check(
	'single distinct words in decorations',
	['they', 'he', 'she', 'xe', 'fae', 'any'].flatMap(word =>
		['$', '($)', '$ 🌸', '✨ $ ✨', '$ | 19', '19 | $', 'pronouns: $', '$ pronouns'].map(d => [d.replace('$', word), word] as Case),
	),
)

/** Pronoun words that are also words or name parts: never a badge without a slash and a partner. */
const AMBIGUOUS_WORDS = [
	'his', 'her', 'their', 'it', 'its', 'one', 'e', 'em', 'ems', 'ey', 've', 'ver', 'vis', 'vir', 'ne', 'nym',
	'per', 'pers', 'thon', 'ae', 'co', 'cos', 'hu', 'hum', 'hus', 'ki', 'kin', 'kis', 'sie', 'shi', 'hiz',
	'star', 'stars', 'bun', 'buns', 'vae', 'mew', 'mews', 'pup', 'pups', 'nya', 'nyan', 'void', 'voids',
	'kit', 'kits', 'bee', 'bees', 'fox', 'foxes', 'cat', 'cats', 'lu', 'lum', 'lus', 'yo', 'yos', 'te',
	'tem', 'ter', 'di', 'dem', 'dir', 'ya', 'yam', 'ix', 'ixs', 'zes', 'zem', 'zim', 'xir', 'nir', 'aer',
]

/** Name and phrase patterns. `$` is the ambiguous word. */
const NAME_PATTERNS = [
	'$', '$!', '($)', '$ 🌸', '$ | 19', 'Emperor $ Hao', 'Lord $', 'Lady $', 'Mr $', 'Ms $', 'Dr $',
	'$ Smith', 'John $', '$ the Great', 'the $', 'a $', 'my $', 'not a $', '$ lover', '$ fan',
	'$ $', '$ $ $', 'I am $', 'call me $', '$ gaming', '$ main', '$#1234', '$_', 'xX$Xx',
	'King $ | 20', '$ forever', 'team $', '$ supremacy', '$/dog', 'dog/$', '$/AC', '$/20',
]

check(
	'ambiguous words in names and phrases give no badge',
	AMBIGUOUS_WORDS.flatMap(word => NAME_PATTERNS.map(pattern => [pattern.replaceAll('$', word), undefined] as Case)),
)

check(
	'a real pronoun next to an ambiguous name still shows',
	AMBIGUOUS_WORDS.flatMap(word => [
		[`${word} | she/her`, 'she/her'] as Case,
		[`Lord ${word} (he/him)`, 'he/him'] as Case,
		[`they/them | ${word} fan`, 'they/them'] as Case,
		[`${word}, they`, 'they'] as Case,
	]),
)

/** Real names built from pronoun-shaped syllables. */
const NAMES = [
	'Shi Hao', 'Shi Yan', 'Hu Tao', 'Hu Jintao', 'Lu Bu', 'Lu Xun', 'Lu Han', 'Di Renjie', 'Ki Hong Lee',
	'Kim Ki-duk', 'Ye Xiu', 'Yo Asakura', 'Yo-Yo Ma', 'Te Fiti', 'Ki Adi Mundi', 'Ne-Yo', 'Ae Jin',
	'Co Ba', 'Per Mertesacker', 'Ver Bueno', 'Em Beihold', 'Star Butterfly', 'Kit Connor', 'Kit Harington',
	'Fox Mulder', 'Bee Gees', 'Cat Stevens', 'Cat Noir', 'Void Stranger', 'Mew Mew', 'Nya Ichigo',
	'Bun Bun', 'Pup Smith', 'Ix Chel', 'Lum Invader', 'Sie Kensou', 'Thon Maker', 'Di Maria',
	'Ya Boi Kongming', 'Tem Shop', 'Dem Bones', 'Kin Kaid', 'Hum Tum', 'Vis Major', 'Star Lord',
	'Hiz Highness', 'Per Aspera', 'Co-op Kid', 'Ve Neill', 'Ne Zha', 'Emperor Shi Hao', 'Shi Huangdi',
	'Qin Shi Huang', 'Lu Zhishen', 'Di Lieba', 'Ki-woo', 'Kit Kat', 'One Direction', 'The One',
	'Her Royal Highness', 'His Majesty', 'Its Joever', 'It Follows', 'Their Majesties',
]

check('real names', NAMES.flatMap(name => [[name, undefined] as Case, [name.toLowerCase(), undefined] as Case, [name.toUpperCase(), undefined] as Case]))

check(
	'real names next to real pronouns',
	NAMES.flatMap(name => [
		[`${name} | he/him`, 'he/him'] as Case,
		[`she/her • ${name} stan`, 'she/her'] as Case,
		[`${name} (they/them)`, 'they/them'] as Case,
	]),
)

/** Bios and jokes people put in the field. */
const BIOS = [
	'i love her', 'i love him', 'love you', 'he is my world', 'she said yes', 'they did it', 'it is what it is',
	'his and hers towels', 'one love', 'all for one', 'one and only', 'no one', 'anyone', 'everyone',
	'him? never heard of him', 'who is she', 'her loss', 'his loss', 'their loss', 'its giving',
	'it girl', 'it boy', 'he who remains', 'she wolf', 'the cat in the hat', 'fox and the hound',
	'star wars fan', 'the void stares back', 'bee movie script', 'pup patrol', 'kit and kaboodle',
	'yo mama', 'ya know', 'te quiero', 'di me', 'per my last email', 'ne nana', 'em dash enjoyer',
	'e-girl', 'e boy', 'hu are you', 'co-pilot', 've got this', 'ki blast', 'shi tzu', 'lu lu lemon',
	'ix nay', 'mew two', 'nya nya', 'bun in the oven', 'cats are better', 'dogs > cats', 'cat/dog person',
	'call me daddy', 'mommy', 'your honor', 'sir', "ma'am", 'king', 'queen', 'princess', 'bro', 'dude',
	'god', 'jesus loves you', 'follow my insta', 'twitch.tv/someone', 'linktr.ee/x', 'he/him/his/himself/hehe',
	'idk lol', 'ask me later', 'none of your business', 'not telling', 'secret', '???', 'n/a', 'none',
	'use my name', 'just my name', 'name only', 'no pronouns pls', 'pronouns? never heard of them',
	'i identify as a meme', 'attack helicopter', 'apache helicopter', 'walmart bag', 'gamer', 'human',
	'he/him? more like he/him/hehe', 'ur/mom', 'lol/lmao', 'xd/xd', 'uwu/owo', 'this/that', 'yes/no',
	'on/off', 'in/out', 'w/o', 'b/c', 'and/or', 'he-man', 'she-ra', 'it-crowd',
]

const BIO_ANSWERS: Record<string, string> = {
	'he/him/his/himself/hehe': 'he/him/his/himself',
	'he/him? more like he/him/hehe': 'he/him',
}

check('bios and jokes', BIOS.map(bio => [bio, BIO_ANSWERS[bio]] as Case))

check(
	'bios with pronouns attached',
	BIOS.filter(bio => !(bio in BIO_ANSWERS)).flatMap(bio => [
		[`he/him | ${bio}`, 'he/him'] as Case,
		[`${bio} | she/her`, 'she/her'] as Case,
		[`they/them\n${bio}`, 'they/them'] as Case,
	]),
)
