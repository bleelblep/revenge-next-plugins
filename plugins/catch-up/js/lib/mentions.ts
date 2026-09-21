/**
 * Keeping the summary's mentions honest.
 *
 * The transcript names every person as a mention (`<@id>`), and the prompt tells the model to
 * refer to people only by copying those exactly. Models still occasionally drop or swap a digit,
 * and a wrong id does not fail loudly: Discord renders it as a pill for whoever owns that id, or
 * as "@unknown-user". So any mention whose id was not in the transcript is replaced with plain
 * "someone" -- vaguer, but never somebody else.
 *
 * The summary is only ever a clientside message (`clientMessage.ts`), so the mentions that do
 * survive render as tappable pills and never ping anybody.
 */

const MENTION = /<@!?(\d+)>/g

export function keepKnownMentions(text: string, known: Set<string>): string {
	return text.replace(MENTION, (raw: string, id: string) =>
		known.has(id) ? `<@${id}>` : 'someone',
	)
}
