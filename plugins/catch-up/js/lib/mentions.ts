/**
 * Keeping the summary's mentions honest.
 *
 * The transcript names people by name (`lib/transcript.ts` says why), so the summary does too, and
 * `namesToMentions` turns each name it finds back into a mention: a whole-word, case-exact match of
 * a name from the transcript, with or without an `@` in front.
 *
 * A model can still write a mention itself, and a wrong id does not fail loudly: Discord renders
 * it as a pill for whoever owns that id, or as "@unknown-user". So any mention whose id was not
 * in the transcript is replaced with plain "someone" -- vaguer, but never somebody else.
 *
 * The summary is only ever a clientside message (`clientMessage.ts`), so the mentions that do
 * survive render as tappable pills and never ping anybody.
 */

const MENTION = /<@!?(\d+)>/g
// Letters and digits of any script count as part of a word, so "Maya" isn't found inside "Mayan".
const WORD = /[A-Za-z0-9_\u00C0-\uFFFF]/

function isWord(char: string | undefined): boolean {
	return !!char && WORD.test(char)
}

/** Every name from [people] in [text] as a `<@id>` mention, longest names first. */
export function namesToMentions(text: string, people: Map<string, string>): string {
	const names = [...people.keys()].filter(name => name.length >= 2).sort((a, b) => b.length - a.length)
	if (!names.length) return text
	let out = ''
	let i = 0
	scan: while (i < text.length) {
		const at = text[i] === '@' ? 1 : 0
		if (!isWord(text[i - 1])) {
			for (const name of names) {
				const end = i + at + name.length
				if (text.startsWith(name, i + at) && !isWord(text[end])) {
					out += `<@${people.get(name)}>`
					i = end
					continue scan
				}
			}
		}
		out += text[i]
		i++
	}
	return out
}

export function keepKnownMentions(text: string, known: Set<string>): string {
	return text.replace(MENTION, (raw: string, id: string) =>
		known.has(id) ? `<@${id}>` : 'someone',
	)
}
