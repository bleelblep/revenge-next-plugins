/**
 * `/ai`: a question in, a private answer out.
 *
 * Every reply is a clientside message (shared/commands.ts `showClientMessage`): it exists only on
 * this device, marked "Only you can see this", and nothing is sent to Discord. Errors go the same
 * way, so a failure is private too.
 *
 * The system prompt is a constant so providers that cache prompt prefixes can reuse it; the
 * question and the length choice go in the user message.
 */

import { argument, OptionType, registerCommand, showClientMessage } from './commands'
import { type AiHandle, getAi, settings, toast } from './state'

/** Discord's message limit is 2000; a little under leaves room for the part counter. */
const CHUNK = 1900
const MAX_QUESTION = 4000

const SYSTEM = [
	'You are a private assistant inside Discord. Only the person asking sees your answer.',
	'',
	'- Answer the question directly and accurately. If you are not sure, say so instead of guessing.',
	'- Maths: show the key steps briefly, then give the final answer in **bold**.',
	'- Use Discord markdown where it helps: **bold**, *italics*, `code`, ```code blocks```, - lists. No tables, no headings bigger than ###.',
	'- Write in the language of the question.',
	'- Keep it as short as the question allows.',
].join('\n')

const LENGTH: Record<string, { words: string; maxTokens: number }> = {
	short: { words: 'Answer in at most 2 sentences.', maxTokens: 300 },
	normal: { words: 'Answer in at most about 150 words unless the question needs more.', maxTokens: 900 },
	long: { words: 'Answer as fully as the question needs.', maxTokens: 2500 },
}

export const HELP = [
	'**Ask AI: a private assistant**',
	'Type `/ai`, pick **question**, and write anything. The answer shows up here, and only you can see it.',
	'',
	'**Examples**',
	"- `/ai question: What's 76 - 67?`",
	'- `/ai question: Explain photosynthesis simply`',
	'- `/ai question: How do I centre a div?`',
	'',
	'**Good to know**',
	'- Nothing is posted to the channel; answers stay on this device.',
	'- `/ai question: help` or `/ai` on its own shows this again.',
	'- Answer length is set in Ask AI settings. Answers come from the AI service set up in AI Core.',
].join('\n')

/** Splits [text] into Discord-sized parts, at paragraph or line breaks where possible. */
export function chunks(text: string): string[] {
	const out: string[] = []
	let rest = text.trim()
	while (rest.length > CHUNK) {
		let at = rest.lastIndexOf('\n\n', CHUNK)
		if (at < CHUNK / 2) at = rest.lastIndexOf('\n', CHUNK)
		if (at < CHUNK / 2) at = rest.lastIndexOf(' ', CHUNK)
		if (at < CHUNK / 2) at = CHUNK
		out.push(rest.slice(0, at).trimEnd())
		rest = rest.slice(at).trimStart()
	}
	if (rest) out.push(rest)
	return out
}

function reply(channelId: string | undefined, content: string) {
	if (!channelId) {
		toast(content.slice(0, 120))
		return
	}
	const parts = chunks(content)
	for (const part of parts) {
		// The clientside message is the whole output; if it can't be shown, a toast is all there is.
		if (!showClientMessage({ channelId, content: part })) {
			toast(part.slice(0, 120))
			return
		}
	}
}

/** Why the AI can't answer right now, phrased for the user, or undefined when it can. */
function unavailable(ai: AiHandle | undefined): string | undefined {
	if (!ai) return "**Ask AI couldn't reach AI Core.** Make sure AI Core is installed and turned on, then restart Discord."
	if (ai.isAvailable()) return undefined
	const budget = ai.budget()
	return budget.configured
		? `**AI Core's daily limit is used up** (${budget.used} of ${budget.cap}). It resets at midnight, or raise it in AI Core settings.`
		: "**AI Core has no API key yet.** Add one under AI Core > Provider, then try again."
}

export async function ask(question: string): Promise<string> {
	const ai = getAi()
	const problem = unavailable(ai)
	if (problem) return problem
	const length = LENGTH[settings().length] ?? LENGTH.normal
	try {
		const answer = await ai!.text({
			temperature: 0.3,
			maxTokens: length.maxTokens,
			timeoutMs: 60_000,
			messages: [
				{ role: 'system', content: SYSTEM },
				{ role: 'user', content: `${length.words}\n\nQuestion:\n${question.slice(0, MAX_QUESTION)}` },
			],
		})
		const text = answer?.trim()
		return text || "**No answer came back.** The AI service didn't reply in time or refused. Check AI Core > Debug for details."
	} catch (error: any) {
		return `**Something went wrong asking the AI.** ${String(error?.message ?? error).slice(0, 200)}`
	}
}

export function registerAi(): () => void {
	return registerCommand({
		name: 'ai',
		description: 'Ask anything and get an answer only you can see. /ai help for how to use it',
		options: [
			{
				name: 'question',
				description: 'What you want to know. "help" shows how to use /ai',
				type: OptionType.String,
			},
		],
		execute(args, context) {
			const channelId = context?.channel?.id
			const question = String(argument(args, 'question', '') ?? '').trim()
			if (!question || /^help\??$/i.test(question)) {
				reply(channelId, HELP)
				return
			}
			toast('Thinking…')
			void ask(question).then(answer => {
				const shown = settings().showQuestion ? `> ${question.replace(/\n/g, '\n> ')}\n\n${answer}` : answer
				reply(channelId, shown)
			})
		},
	})
}
