/**
 * Styles: rewriting a whole message in a voice -- uwu, Elmer Fudd, pirate, Pig Latin, your own.
 *
 * Never automatic. From the swipe-up Preview, Restyle picks a style; the preview reopens with the
 * result, and only Send sends it. Nothing is rewritten on an ordinary tap of the send button.
 *
 * ## AI and local styles
 *
 * Every built-in style starts switched off; Styles is where you pick the ones the picker shows.
 *
 * Most styles are a prompt for AI Core: one call per restyle, from AI Core's shared daily budget,
 * and the message text goes to the provider set up in AI Core. They only appear while AI Core is
 * installed. Pig Latin is done here instead: it is exact letter-shuffling, which models get wrong,
 * and doing it locally makes it instant, free and available without AI Core.
 *
 * ## Links, mentions and code survive
 *
 * Before a message goes to the model, every code span, link, mention, custom emoji, timestamp,
 * `:shortcode:` and Send Tweaks template placeholder is swapped for a numbered token (⟦0⟧, ⟦1⟧...),
 * and swapped back afterwards. The model never sees a link it could "fix", and a style that
 * changes every r to w cannot touch a mention. A token the model drops is put back at the end of
 * the message, so nothing is lost -- the preview shows where it landed before anything is sent.
 *
 * ## Sending the result
 *
 * Preview's Send presses Discord's own send button, so the message (reply, attachments and all)
 * goes the normal way. `armRestyle` records the styled text first and the send hook swaps it in
 * (`takeRestyle`). The tokens are filled from the message actually being sent when it has the same
 * number of protected spans as the draft: Discord turns `:emoji:` into `<:emoji:id>` between the
 * box and the send, and this keeps the real one. Like the long-press one-offs, it expires after a
 * few seconds so it can never land on a later, unrelated message.
 */

import { protectedPattern } from './codeSpans'
import { getAi, TAG } from './state'
import type { SendTweaksStorage } from '../types'

export interface CustomStyle {
	id: string
	name: string
	/** How to rewrite, in plain words: "like a pirate", "as a haiku". */
	prompt: string
}

export interface Style {
	id: string
	name: string
	/** One line for the picker. */
	description: string
	/** The style instruction for AI Core. Absent for local styles. */
	prompt?: string
	/** Rewrites the masked text on the phone. Present for local styles. */
	local?: (masked: string) => string
	custom?: boolean
}

const OPEN = '⟦'
const CLOSE = '⟧'
const TOKEN = /⟦(\d+)⟧/g

/** Template placeholders, random blocks and :shortcodes:, on top of code, tokens and links. */
const EXTRA = String.raw`\$(?:random|shuffle)\{(?:[^{}]|\{[^{}]*\})*\}|\{[A-Za-z][\w:.-]{0,40}\}|:[\w~+-]{2,32}:`

function pattern(): RegExp {
	return new RegExp(`${protectedPattern().source}|${EXTRA}`, 'gi')
}

export interface Masked {
	masked: string
	spans: string[]
}

export function mask(text: string): Masked {
	const spans: string[] = []
	const masked = text.replace(pattern(), span => {
		spans.push(span)
		return `${OPEN}${spans.length - 1}${CLOSE}`
	})
	return { masked, spans }
}

/** Puts the spans back. Any the rewrite dropped go at the end; unknown numbers are removed. */
export function unmask(masked: string, spans: string[]): string {
	const used = new Set<number>()
	let out = masked.replace(TOKEN, (_, index: string) => {
		const at = Number(index)
		if (!(at < spans.length)) return ''
		used.add(at)
		return spans[at]
	})
	const missing = spans.filter((_, at) => !used.has(at))
	if (missing.length) out = `${out.replace(/\s+$/, '')} ${missing.join(' ')}`
	return out
}

/** "hello" -> "ellohay", "apple" -> "appleway", "Quick" -> "Ickquay", "DON'T" -> "ON'TDAY". */
export function pigLatinWord(word: string): string {
	const lower = word.toLowerCase()
	let split = 0
	if (!/^[aeiou]/.test(lower)) {
		const cluster = /^(?:qu|[^aeiouy]*qu|[^aeiou][^aeiouy]*)/.exec(lower)
		split = cluster ? cluster[0].length : 0
	}
	if (split >= word.length) return `${word}ay`
	const base = split === 0 ? `${lower}way` : `${lower.slice(split)}${lower.slice(0, split)}ay`
	if (word.length > 1 && word === word.toUpperCase()) return base.toUpperCase()
	if (word[0] !== lower[0]) return base[0].toUpperCase() + base.slice(1)
	return base
}

export function pigLatin(masked: string): string {
	return masked.replace(/[A-Za-z]+(?:['’][A-Za-z]+)*/g, pigLatinWord)
}

/**
 * Shipped styles, all off until switched on in Styles (`enabledStyles`). Ids are stored, so never
 * rename one.
 *
 * Each prompt names the voice, lists what makes it recognisable, says how far to push it, and
 * ends with one short example. Small models copy the example's strength better than they follow
 * adjectives, so the example sets how heavy the style is.
 */
export const PRESETS: Style[] = [
	{
		id: 'uwu',
		name: 'uwu',
		description: 'Soft w-speech, stutters and kaomoji',
		prompt: `uwu speak.
- Turn most r and l sounds into w (really -> weawwy, love -> wuv, hello -> hewwo), but keep every word recognisable.
- "the" can become "da", "this" can become "dis", "you" can become "yuu" now and then.
- One or two light stutters per message (h-hi, s-so), never more.
- End some sentences with a kaomoji or uwu-ism: uwu, owo, >w<, :3, ^w^, (｡•ᴗ•｡).
- All lower case. Use *action asides* like *nuzzles* or *blushes* sparingly, at most one.
Example: "I really love this song, thank you" -> "i weawwy wuv dis song, t-thank yuu uwu"`,
	},
	{
		id: 'elmer',
		name: 'Elmer Fudd',
		description: 'Vewy, vewy quiet. Wabbit-hunting speech',
		prompt: `Elmer Fudd from Looney Tunes.
- Replace r and l sounds with w everywhere: rabbit -> wabbit, very -> vewy, really -> weawwy, little -> widdle, please -> pwease, silly -> siwwy.
- Soft, polite and a little flustered; a whispered "(shhh)" or a "hehehehe" laugh at most once.
- Keep the original meaning. Don't bring up rabbits, hunting or Bugs Bunny unless the message does.
Example: "Be really quiet, I'm trying to read" -> "Be vewy, vewy quiet, I'm twying to wead. Hehehehe."`,
	},
	{
		id: 'pig-latin',
		name: 'Pig Latin',
		description: 'Done on your phone, no AI: ellohay orldway',
		local: pigLatin,
	},
	{
		id: 'gen-z',
		name: 'Gen Z',
		description: 'no cap this is giving main character fr',
		prompt: `Gen Z internet speak.
- Lower case, little punctuation, no full stop at the end.
- Use current slang where it fits naturally: fr, no cap, lowkey, highkey, ngl, deadass, it's giving, slay, ate, bestie, rizz, mid, bussin, the way that, i'm crying, real.
- Exaggerate reactions ("i'm deceased", "screaming"), and maybe one emoji like 💀 😭 🔥 or ✨.
- Two or three slang terms per message is plenty; it should still read like a real text.
Example: "That outfit looks really good on you" -> "ngl that fit is lowkey eating, you ate fr 🔥"`,
	},
	{
		id: 'pirate',
		name: 'Pirate',
		description: 'Arr, matey',
		prompt: `a swashbuckling pirate.
- you -> ye, your -> yer, my -> me, is/are -> be, yes -> aye, hello -> ahoy, friend -> matey.
- Drop the g from -ing words (sailin', lookin').
- One exclamation like "Arr!", "Yo ho!" or "Shiver me timbers!", and a nautical image if it fits (treasure, the seven seas, Davy Jones).
Example: "Are you coming to the party tonight?" -> "Ahoy matey! Be ye comin' to the shindig tonight? Arr!"`,
	},
	{
		id: 'shakespeare',
		name: 'Shakespeare',
		description: 'Thee, thou and forsooth',
		prompt: `Early Modern English, as Shakespeare wrote it.
- thee/thou/thy/thine for you/your, doth/hath/art/wilt, -eth and -est verb endings (he goeth, thou knowest).
- Words like prithee, forsooth, methinks, alas, anon, ere, 'tis.
- Theatrical and a little grand, but about as long as the original; no stage directions.
Example: "I think you're wrong about that" -> "Methinks thou art mistaken in this matter, good friend."`,
	},
	{
		id: 'yoda',
		name: 'Yoda',
		description: 'Backwards, your sentences become',
		prompt: `Yoda from Star Wars.
- Move the object or complement to the front: "I am ready" -> "Ready, I am." "You must go" -> "Go, you must."
- Calm and wise, with an occasional "Hmm." or "Yes, hmm." and maybe one line of gentle wisdom.
- Keep it about as long as the original.
Example: "I'm going to be late for dinner" -> "Late for dinner, I will be. Hmm."`,
	},
	{
		id: 'cowboy',
		name: 'Cowboy',
		description: "Howdy, partner. Reckon y'all",
		prompt: `a Wild West cowboy.
- howdy, partner, reckon, y'all, fixin' to, mighty, darn, yonder, varmint; drop the g from -ing words.
- At most one folksy simile, like "busier than a one-legged man in a kicking contest".
- A "yeehaw" only if the mood is excited.
Example: "I'm about to head home, it's been a long day" -> "Well partner, I'm fixin' to mosey on home. Been a mighty long day."`,
	},
	{
		id: 'caveman',
		name: 'Caveman',
		description: 'Me talk simple. Ugh.',
		prompt: `a caveman.
- Very short, simple sentences. Drop "the", "a" and most small words; no tenses ("me go", not "I went").
- "me" instead of "I". Simple words: fire, rock, food, big, good, bad.
- An occasional grunt like "Ugh." or "Oog." Capitalise normally.
Example: "I'm really hungry, do you want to get pizza?" -> "Me very hungry. You want pizza? Ugh. Pizza good."`,
	},
	{
		id: 'dramatic',
		name: 'Overly dramatic',
		description: 'Everything is a tragedy or a triumph',
		prompt: `an overly dramatic soap-opera character.
- Everything is a devastating tragedy or a glorious triumph; mild things become life or death.
- Exclamation marks, rhetorical questions, gasps ("How COULD you?!"), a word or two in capitals for emphasis.
- Keep the same facts; just make it the most important thing that has ever happened.
Example: "I forgot my umbrella and got a bit wet" -> "I forgot my umbrella. The heavens OPENED. I am drenched, betrayed by the very sky itself!"`,
	},
	{
		id: 'corporate',
		name: 'Corporate',
		description: "Let's circle back on that",
		prompt: `corporate buzzword speak, like a manager's email.
- circle back, touch base, leverage, synergy, bandwidth, align, action item, going forward, deep dive, move the needle, per my last message.
- Turn simple feelings into business language ("I'm tired" -> "I'm at capacity").
- Upbeat and professional; no greeting or sign-off.
Example: "I can't make it today, can we do tomorrow?" -> "I don't have the bandwidth today. Can we circle back and align tomorrow?"`,
	},
	{
		id: 'haiku',
		name: 'Haiku',
		description: 'Five, seven, five',
		prompt: `a haiku.
- Exactly three lines of 5, 7 and 5 syllables, separated by line breaks. Count carefully.
- Keep the message's meaning; a small nature image is welcome if it fits.
- No title and no extra lines.
Example: "I'm so tired, going to bed" -> "eyelids heavy now / the long day folds into night / I drift off to sleep" (each part on its own line)`,
	},
	{
		id: 'knight',
		name: 'Knight',
		description: 'Upon mine honour, good sir',
		prompt: `a chivalrous medieval knight.
- my liege, good sir or my lady, verily, forsooth, upon mine honour, quest, steed, I shall.
- Noble, earnest and a bit grand; small tasks become quests.
- Keep it about as long as the original.
Example: "I'll grab some snacks on the way" -> "Fear not, I shall embark upon a quest for provisions on my journey hither!"`,
	},
	{
		id: 'cat',
		name: 'Cat',
		description: 'Nya. Feed me. Purr',
		prompt: `a cat who can type.
- Mix in nya, mrrp, meow and *purrs*, but keep the meaning readable.
- Aloof, self-important and a little demanding; mention naps, food or knocking things off tables only if it fits.
- At most one *action* like *stretches* or *knocks your cup over*.
Example: "Can you come over later?" -> "nya. you may come over later. bring treats. *purrs*"`,
	},
	{
		id: 'formal',
		name: 'Very formal',
		description: 'Polished and polite, like a work email',
		prompt: `very formal, polite English, as in a careful business email.
- Full sentences, no slang or contractions, courteous phrasing ("I would be grateful if...").
- No greeting, sign-off or name. Keep it about as long as the original.
Example: "can u send me that file" -> "Would you kindly send me that file at your convenience?"`,
	},
	{
		id: 'grammar',
		name: 'Fix spelling and grammar',
		description: 'Same tone, just corrected',
		prompt: `the same message with only spelling, grammar and punctuation corrected.
- Keep the writer's words, tone and slang. Don't reword anything that is already correct.
- Keep lower case, emoji and abbreviations like lol if they look deliberate.
Example: "i dont think their coming tmrw lol" -> "i don't think they're coming tmrw lol"`,
	},
	{
		id: 'shorter',
		name: 'Shorter',
		description: 'Same meaning, half the words',
		prompt: `the same meaning and tone in half as many words or fewer.
- Keep names, numbers, links and the actual request; drop filler and repetition.
Example: "Hey, I just wanted to ask whether you might be free at some point tomorrow to talk" -> "Hey, free to talk tomorrow?"`,
	},
]

/** Every style the picker offers, in order: the built-in ones you switched on, then your own. */
export function allStyles(s: Pick<SendTweaksStorage, 'customStyles' | 'enabledStyles'>): Style[] {
	const enabled = new Set(s.enabledStyles ?? [])
	const custom: Style[] = (s.customStyles ?? [])
		.filter(style => style.name.trim() && style.prompt.trim())
		.map(style => ({
			id: style.id,
			name: style.name.trim(),
			description: style.prompt.trim(),
			prompt: style.prompt.trim(),
			custom: true,
		}))
	return [...PRESETS.filter(style => enabled.has(style.id)), ...custom]
}

const SYSTEM = (style: string) => `You rewrite one Discord chat message in a style. Reply with the rewritten message only: no quotes around it, no notes, no explanation.

- Keep the meaning, the language and the person speaking ("I" stays "I"). Do not add facts, questions, greetings or sign-offs.
- Tokens like ${OPEN}0${CLOSE} and ${OPEN}1${CLOSE} stand for links, mentions, emoji or code. Copy each one exactly once, unchanged, where it fits.
- Keep markdown (**bold**, *italics*, > quotes, lists) and line breaks.
- Never refuse and never comment on the message. If the style fits badly, get as close as you can.
- The style's example only shows how strong to make it. Never copy its words into the reply.

The style: ${style}`

/** What came back, without the wrapping some models add anyway. */
function clean(answer: string, original: string): string {
	let out = answer.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
	const fence = /^```[\w-]*\n([\s\S]*?)\n```$/.exec(out)
	if (fence && !original.trim().startsWith('```')) out = fence[1].trim()
	const quoted = /^(["“'])([\s\S]*)(["”'])$/.exec(out)
	if (quoted && !/^["“']/.test(original.trim())) out = quoted[2].trim()
	return out
}

export type Restyled =
	| { ok: true; text: string; masked: string; spans: string[] }
	| { ok: false; error: string }

export function aiReady(): boolean {
	try {
		return !!getAi()?.isAvailable()
	} catch {
		return false
	}
}

export async function restyle(draft: string, style: Style): Promise<Restyled> {
	const { masked, spans } = mask(draft)

	if (style.local) {
		const out = style.local(masked)
		return { ok: true, masked: out, spans, text: unmask(out, spans) }
	}

	const ai = getAi()
	if (!ai?.text) return { ok: false, error: 'This style needs AI Core.' }
	if (!ai.isAvailable()) {
		return { ok: false, error: "AI Core can't make calls right now: set a key in its settings, or today's limit is used up." }
	}
	if (!masked.trim()) return { ok: false, error: 'There are no words to restyle.' }

	let answer: string | undefined
	try {
		answer = await ai.text({
			messages: [
				{ role: 'system', content: SYSTEM(style.prompt ?? style.name) },
				{ role: 'user', content: masked.slice(0, 4000) },
			],
			temperature: 0.7,
			maxTokens: 1500,
			timeoutMs: 30_000,
		})
	} catch (error: any) {
		console.error(`${TAG} restyle failed:`, error)
		return { ok: false, error: error?.message ? `AI request error: ${error.message}` : 'The AI request failed.' }
	}
	const out = clean(answer ?? '', masked)
	if (!out) return { ok: false, error: 'Nothing came back. Try again.' }
	return { ok: true, masked: out, spans, text: unmask(out, spans) }
}

const LIFETIME_MS = 5000
let pending: { masked: string; spans: string[]; until: number } | undefined

/** Called by Preview's Send just before it presses the send button. */
export function armRestyle(result: { masked: string; spans: string[] }) {
	pending = { masked: result.masked, spans: result.spans, until: Date.now() + LIFETIME_MS }
}

export function clearRestyle() {
	pending = undefined
}

/**
 * The styled text for the message being sent ([content]), once, or undefined when none is waiting.
 * The tokens are filled from [content]'s own spans when it has the same number as the draft.
 */
export function takeRestyle(content: string): string | undefined {
	const current = pending
	pending = undefined
	if (!current || Date.now() >= current.until) return undefined
	const live = mask(content).spans
	return unmask(current.masked, live.length === current.spans.length ? live : current.spans)
}

export function newStyleId(): string {
	return `custom-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}
