/**
 * Translating everything that is not already in your language.
 *
 * ## The cost problem, and how it is kept in hand
 *
 * The manual button translates one message a person deliberately chose. This sees every message
 * in the channel, and the services only report a source language *after* translating — so naively
 * this would send every message to be translated in order to discover that most of them did not
 * need it. That would be slow, would exhaust MyMemory's daily quota in an afternoon, and would
 * look like abuse to the other three.
 *
 * Four things stop that:
 *
 * 1. `looksLikeTarget` filters locally first, on script and function words, and settles the
 *    obvious majority without a request.
 * 2. Only the channel you are looking at is swept, and only messages that are actually loaded.
 * 3. A concurrency limit and a per-sweep cap, so arriving in a busy channel is a handful of
 *    requests rather than a hundred.
 * 4. Anything already translated is never asked about twice, including messages the services
 *    came back and said were already in the target language.
 *
 * ## Why it listens to the dispatcher rather than the row hook
 *
 * The row hook runs during generation, which is a hot synchronous path — starting network calls
 * from inside it would be wrong on principle and would fire again on every repaint. `MESSAGE_CREATE`
 * and channel selection are the two moments that actually mean "there is new text here".
 */

import { looksLikeTarget } from '../lib/detect'
import { repaintMessage } from '../lib/repaint'
import { debug, settings } from '../lib/state'
import { fetchTranslation } from '../lib/translate'
import { setShowing, translationFor } from '../lib/translations'

/** Messages per sweep. Arriving in a busy channel should not be a hundred requests. */
const MAX_PER_SWEEP = 12
/** In flight at once, so a sweep does not arrive as a burst. */
const MAX_CONCURRENT = 3
/** Below this there is not enough text to judge or to be worth translating. */
const MIN_LENGTH = 8
/** Settle time after a channel change, so switching channels quickly costs nothing. */
const SWEEP_DELAY_MS = 900

const status = { sweeps: 0, translated: 0, skipped: 0 }

export function autoStatus(): {
	sweeps: number
	translated: number
	skipped: number
} {
	return { ...status }
}

function currentChannelId(): string | undefined {
	try {
		const id = (
			revenge.discord.flux.Stores as any
		)?.SelectedChannelStore?.getChannelId?.()
		return typeof id === 'string' && id ? id : undefined
	} catch {
		return undefined
	}
}

function loadedMessages(channelId: string): any[] {
	try {
		const result = (
			revenge.discord.flux.Stores as any
		)?.MessageStore?.getMessages?.(channelId)
		return (
			result?._array ??
			result?.toArray?.() ??
			(Array.isArray(result) ? result : [])
		)
	} catch {
		return []
	}
}

/** Bot output and system notices are noise, and usually already in the target language. */
function worthTranslating(message: any, target: string): boolean {
	if (!message || message.author?.bot) return false
	if (typeof message.content !== 'string') return false

	const text = message.content.trim()
	if (text.length < MIN_LENGTH) return false
	if (translationFor(message.id)) return false
	if (looksLikeTarget(text, target)) {
		status.skipped++
		return false
	}
	return true
}

let sweeping = false
let sweepTimer: ReturnType<typeof setTimeout> | undefined

async function sweep() {
	if (sweeping) return
	const s = settings()
	if (!s.autoTranslate) return

	const channelId = currentChannelId()
	if (!channelId) return

	const candidates = loadedMessages(channelId)
		.filter(message => worthTranslating(message, s.target))
		.slice(-MAX_PER_SWEEP)

	if (!candidates.length) return

	sweeping = true
	status.sweeps++
	debug(`auto sweep: ${candidates.length} candidates in ${channelId}`)

	try {
		// A small worker pool rather than Promise.all: three at a time keeps the services happy
		// and keeps a slow one from holding up the rest.
		const queue = [...candidates]
		const workers = Array.from(
			{ length: Math.min(MAX_CONCURRENT, queue.length) },
			async () => {
				while (queue.length) {
					const message = queue.shift()
					if (!message) return
					const ok = await fetchTranslation(message.id, message.content, true)
					if (ok) {
						setShowing(message.id, true)
						repaintMessage(channelId, message.id)
						status.translated++
					}
				}
			},
		)
		await Promise.all(workers)
	} catch (error) {
		console.error('[Translate] auto sweep failed:', error)
	} finally {
		sweeping = false
	}
}

function scheduleSweep() {
	if (sweepTimer !== undefined) clearTimeout(sweepTimer)
	sweepTimer = setTimeout(() => {
		sweepTimer = undefined
		sweep().catch(error =>
			console.error('[Translate] auto sweep threw:', error),
		)
	}, SWEEP_DELAY_MS)
}

export default function patchAutoTranslate(): () => void {
	const { onFluxEventDispatched } = revenge.discord.flux
	const unsubscribes: Array<() => void> = []

	// `onFluxEventDispatched` is a transformer, not a listener: whatever the handler returns
	// *becomes* the payload, and a falsy return cancels the event outright (porting rule 2).
	// Both handlers therefore return the payload on every path, outside their try.
	for (const event of ['MESSAGE_CREATE', 'CHANNEL_SELECT'] as const) {
		unsubscribes.push(
			onFluxEventDispatched(event, (payload: any) => {
				try {
					if (settings().autoTranslate) scheduleSweep()
				} catch (error) {
					console.error(`[Translate] ${event} handler failed:`, error)
				}
				return payload
			}),
		)
	}

	return () => {
		if (sweepTimer !== undefined) {
			clearTimeout(sweepTimer)
			sweepTimer = undefined
		}
		for (const unsubscribe of unsubscribes) {
			try {
				unsubscribe()
			} catch {
				/* already gone */
			}
		}
	}
}

/** Called when the toggle flips on, so it does not wait for the next message to arrive. */
export function sweepNow() {
	scheduleSweep()
}
