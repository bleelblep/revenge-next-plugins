/**
 * Puts the two halves in order and decides what, if anything, to spend.
 *
 * ## Patterns first, always
 *
 * The pattern checks in `secrets.ts` are the product. They need no key, no network and no
 * dependency, they run on every send, and they catch the leaks nobody ever means to make. The
 * plugin is fully useful with nothing else installed.
 *
 * The judgement checks sit on top and are strictly optional. They need AI Core, which is declared
 * as an optional dependency: when it is absent `getAi()` is undefined for the whole session and
 * this file quietly stops after the patterns. Nothing degrades, because nothing above the
 * patterns was ever load-bearing.
 *
 * ## The local half is synchronous
 *
 * A send that passes must not be pushed through a promise on its way out. The overwhelming
 * majority of messages are clean, and they should leave on exactly the code path they left on
 * before this plugin was installed.
 */

import { isReachingOut, scoreDraft } from './gate'
import { scanPatterns } from './secrets'
import { aiReady, debug, getAi, isSnoozed, settings } from './state'
import type { Verdict } from '../types'

export type LocalOutcome =
	| { kind: 'pass'; why: string }
	| { kind: 'hold'; verdict: Verdict }
	| { kind: 'ask-model'; categories: string[]; signals: string[] }

/** Discord channel types. 1 is a DM, 3 a group DM; everything else is a server channel. */
function isPrivateChannel(channelId: string): boolean {
	try {
		const type = (
			revenge.discord.flux.Stores as any
		)?.ChannelStore?.getChannel?.(channelId)?.type
		return type === 1 || type === 3
	} catch {
		// Unknown means treat it as a server channel, which is the stricter reading.
		return false
	}
}

export function judgeLocally(text: string, channelId: string): LocalOutcome {
	const s = settings()

	if (!s.enabled) return { kind: 'pass', why: 'disabled' }
	if (typeof text !== 'string' || !text.trim())
		return { kind: 'pass', why: 'empty' }

	// --- Patterns. Run whatever else is switched off, and ignore minLength: a leaked key is a
	// leaked key whether it arrived in three characters or three hundred.
	const hit = scanPatterns(text, {
		checkCredentials: s.checkCredentials,
		checkPersonalDetails: s.checkPersonalDetails,
		personalDetailsApply:
			s.personalDetailsInDms || !isPrivateChannel(channelId),
	})
	if (hit) {
		return {
			kind: 'hold',
			verdict: {
				hold: true,
				category: hit.category,
				reason: hit.reason,
				source: 'local',
			},
		}
	}

	// --- Everything below needs AI Core. Absent, unkeyed or out of budget all mean the same
	// thing here: the patterns already ran, and that is the whole plugin today.
	if (!aiReady()) return { kind: 'pass', why: 'no-ai' }

	// Judgement never gets in the way of someone reaching out.
	if (isReachingOut(text)) return { kind: 'pass', why: 'reaching-out' }

	const categories: string[] = []
	if (s.checkHostile) categories.push('hostile')
	if (s.checkDrunk) categories.push('drunk')
	if (s.checkOversharing) categories.push('oversharing')
	if (!categories.length)
		return { kind: 'pass', why: 'no-judgement-categories' }

	if (text.length < s.minLength) return { kind: 'pass', why: 'too-short' }
	if (isSnoozed()) return { kind: 'pass', why: 'snoozed' }

	const { score, signals } = scoreDraft(text, {
		checkHostile: s.checkHostile,
		checkDrunk: s.checkDrunk,
		checkOversharing: s.checkOversharing,
		hour: new Date().getHours(),
	})

	if (score < s.sensitivity) {
		debug(`gate ${score}/${s.sensitivity} [${signals.join(' ')}] -- passing`)
		return { kind: 'pass', why: `gate-${score}` }
	}

	debug(
		`gate ${score}/${s.sensitivity} [${signals.join(' ')}] -- asking the model`,
	)
	return { kind: 'ask-model', categories, signals }
}

/**
 * Long enough to judge a rant by, short enough that one accidental paste of a logfile cannot cost
 * a fortune. The opening of a message is where the tone lives anyway.
 */
const MAX_CHARS = 4000

const SYSTEM = [
	"You are a send-guard for one person's own outgoing chat message. You see only their draft,",
	'with no conversation around it. Reply with JSON only, no prose, in exactly this shape:',
	'{"hold": true|false, "category": "hostile"|"drunk"|"oversharing"|"none", "confidence": 0.0-1.0,',
	'"reason": "at most twelve words, addressed to the author as you"}',
	'',
	'Hold ONLY if the author would plausibly regret sending this within the hour:',
	'- hostile: real anger aimed at a person. Contempt, an insult meant to wound, an ultimatum',
	'  written in temper.',
	'- drunk: clearly intoxicated or half asleep. Incoherent, stretched words, sentences that',
	'  fall apart partway through.',
	'- oversharing: reveals something private about the AUTHOR or a third party, such as finances,',
	"  medical details, an employer's internal information or someone else's secret, to what may",
	'  be the wrong audience.',
	'',
	'Do NOT hold for:',
	'- swearing, banter, insults between friends, dark humour, sarcasm, in-jokes, memes',
	'- bluntness, disagreement, criticism, or saying no. These are usually deliberate.',
	'- strong feelings expressed calmly',
	'- anyone reaching out about their own distress. Never hold that, under any category.',
	'- a language you are not confident reading. Default to false.',
	'',
	'When in doubt, hold: false. A wrong hold annoys the author far more than a missed one.',
].join('\n')

interface ModelReply {
	hold?: boolean
	category?: string
	confidence?: number
	reason?: string
}

/**
 * The optional half. Returns a passing verdict on every failure — AI Core never throws and never
 * rejects, so an outage, a spent budget or a malformed answer all arrive here as "no opinion".
 */
export async function judgeRemotely(
	text: string,
	categories: string[],
): Promise<Verdict> {
	const ai = getAi()
	const pass: Verdict = {
		hold: false,
		category: 'none',
		reason: '',
		source: 'model',
	}
	if (!ai) return pass

	const reply = await ai.json<ModelReply>({
		temperature: 0,
		maxTokens: 150,
		messages: [
			{ role: 'system', content: SYSTEM },
			{
				role: 'user',
				content: `Categories enabled: ${categories.join(', ')}. Draft:\n\n${
					text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text
				}`,
			},
		],
	})

	// Anything unrecognised reads as a pass. Only an explicit `true` holds a message.
	if (reply?.hold !== true) return pass

	const category = reply.category
	return {
		hold: true,
		category:
			category === 'hostile' ||
			category === 'drunk' ||
			category === 'oversharing'
				? category
				: 'hostile',
		reason:
			typeof reply.reason === 'string' && reply.reason.trim()
				? reply.reason.trim()
				: 'This may not read the way you intend.',
		confidence: typeof reply.confidence === 'number' ? reply.confidence : 0.5,
		source: 'model',
	}
}
