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
	'You summarise a slice of one chat channel for somebody who was away and is catching up.',
	'You are given a transcript, oldest line first, as "name: message".',
	'',
	'Write plain text, no markdown headings, no preamble, no sign-off. Use "-" for bullets.',
	'',
	'Structure:',
	'- Up to six bullets covering what actually happened. One line each.',
	'- Then, only if it applies, a line starting "Decided:" for anything settled.',
	'',
	'Rules:',
	'- Name people as the transcript names them.',
	'- Group a long back-and-forth into one bullet rather than narrating every turn.',
	'- Skip greetings, reactions, and chatter that carries no information.',
	'- If the channel was genuinely quiet, say so in one line and stop. Do not pad.',
	'- Never invent anything that is not in the transcript, and never guess at what a link or an',
	'  attachment contained.',
	'- Keep the whole thing under 120 words.',
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
