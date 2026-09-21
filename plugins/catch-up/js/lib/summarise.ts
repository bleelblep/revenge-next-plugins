/**
 * The prompt, and the one call.
 *
 * ## Why the system prompt is a constant
 *
 * Providers that cache prompt prefixes only do so when the prefix is byte-identical between
 * calls. Keeping everything fixed here, and putting every varying part in the user message,
 * means the second `/catchup` of the day is materially cheaper than the first. That is also why
 * the channel name is not interpolated into the system prompt, tempting as it is.
 */

import { getAi } from './state'
import type { Transcript } from './transcript'

const SYSTEM = [
	'Summarise this Discord channel for someone catching up. Transcript is oldest-first, one "<@id>: message" per line.',
	'',
	'Output: plain text only, one "-" bullet per distinct topic (max 8), under 200 words total. No headings, intro, or sign-off.',
	'',
	'- Each bullet is one short sentence (under 25 words): the gist and outcome, not who said what in order.',
	'- Mention at most 2 people per bullet, each only once. Describe the topic, not the people.',
	'- Use a pronoun only if the bullet has exactly one person in it. Otherwise rephrase. Use "they", never guess gender.',
	"- Every bullet must make sense on its own. Don't refer back to earlier bullets.",
	'- Prioritise decisions, questions, plans, and news. Fold jokes, memes, and banter into one bullet at most.',
	'- Skip greetings, reactions, gifs, and one-off asides.',
	'- Fewer bullets is better. If only 3 topics mattered, write 3.',
	// Load-bearing: `lib/mentions.ts` drops any mention whose id is not in the transcript.
	'- Refer to people only by their mention, copied exactly (e.g. <@123456>). Never invent, alter, or shorten an ID.',
	'- If nothing happened, write one line saying so.',
	"- Only use what's in the transcript. Never guess what a link or attachment contained.",
].join('\n')

export interface SummaryResult {
	text?: string
	/** Set when nothing could be produced, phrased for the user rather than the log. */
	problem?: string
}

export async function summarise(
	transcript: Transcript,
): Promise<SummaryResult> {
	const ai = getAi()
	if (!ai) {
		return {
			problem:
				'AI Core is not available, so there is nothing to summarise with.',
		}
	}
	if (!ai.isAvailable()) {
		const budget = ai.budget()
		return {
			problem: budget.configured
				? `AI Core's daily cap is spent (${budget.used} of ${budget.cap}). It resets at midnight.`
				: 'AI Core has no API key set. Add one under AI Core > Provider.',
		}
	}

	const text = await ai.text({
		temperature: 0.2,
		maxTokens: 400,
		messages: [
			{ role: 'system', content: SYSTEM },
			{ role: 'user', content: transcript.text },
		],
	})

	if (!text?.trim()) {
		return {
			problem:
				'No answer came back. Check AI Core > Debug for what went wrong.',
		}
	}

	return { text: text.trim() }
}
