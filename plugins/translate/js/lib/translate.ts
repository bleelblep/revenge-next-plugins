/**
 * Translating one message, and putting it back.
 *
 * The result rewrites the row rather than arriving as a second message, so the two directions are
 * symmetrical: the same sheet row translates and untranslates, and untranslating restores the
 * original exactly because the original was never changed — only what `RowManager.generate`
 * produced from it was.
 *
 * A translation is fetched once and kept, so toggling back and forth after that is instant and
 * free.
 */

import { PROVIDERS, providerById, translateWithChain } from './providers'
import { repaintMessage } from './repaint'
import { debug, settings, toast } from './state'
import {
	isInFlight,
	isShowing,
	markInFlight,
	remember,
	setShowing,
	showingIds,
	translationFor,
} from './translations'
import type { Provider } from './providers'

/** Records the last outcome for the Debug page. Porting rule 3: report outcomes, not attempts. */
let lastOutcome = 'Nothing translated yet'

export function lastTranslateOutcome(): string {
	return lastOutcome
}

/**
 * The provider order for this run.
 *
 * Pinning one still falls back to the rest afterwards: a pin is a preference, not an instruction
 * to fail. The alternative — pinned service down, plugin dead, no explanation — is exactly the
 * failure the chain exists to avoid.
 */
function orderFor(pinned: string): Provider[] {
	if (pinned === 'auto') return PROVIDERS
	const first = providerById(pinned)
	if (!first) return PROVIDERS
	return [first, ...PROVIDERS.filter(provider => provider.id !== first.id)]
}

/**
 * Whether two codes name the same language, ignoring region and script.
 *
 * Compared on the base code because the services spell things differently: Bing reports
 * `zh-Hans` for text the plugin stores as `zh-CN`, and a prefix match on the full string would
 * decide those were different languages and "translate" Chinese into Chinese.
 */
function sameLanguage(detected: string | undefined, target: string): boolean {
	if (!detected) return false
	const base = (code: string) => code.toLowerCase().split(/[-_]/)[0]
	return base(detected) === base(target)
}

/** What the sheet row should say for this message right now. */
export type RowState = 'translate' | 'show-original' | 'working'

export function rowStateFor(messageId: string): RowState {
	if (isInFlight(messageId)) return 'working'
	return isShowing(messageId) ? 'show-original' : 'translate'
}

/**
 * Fetches a translation and stores it. Does not decide whether to show it.
 *
 * @returns whether there is now a translation to show.
 */
export async function fetchTranslation(
	messageId: string,
	text: string,
	automatic: boolean,
): Promise<boolean> {
	if (translationFor(messageId)) return true
	if (isInFlight(messageId)) return false

	const trimmed = typeof text === 'string' ? text.trim() : ''
	if (!trimmed) return false

	const s = settings()
	markInFlight(messageId, true)

	try {
		const { result, attempts } = await translateWithChain(
			trimmed.slice(0, 2000),
			s.target,
			'auto',
			orderFor(s.provider),
		)

		const trail = attempts.map(a => `${a.id}:${a.outcome}`).join(' ')
		debug(`${messageId}: ${trail || 'no providers tried'}`)

		if (!result) {
			lastOutcome = `all providers failed (${trail})`
			return false
		}

		// Same language in and out means the service found nothing to do. Worth remembering so
		// the auto sweep does not ask about it again, but not worth showing.
		if (s.skipSameLanguage && sameLanguage(result.detected, s.target)) {
			lastOutcome = `${result.provider}: already ${s.target}`
			remember(messageId, { ...result, automatic })
			return false
		}

		lastOutcome = `${result.provider} answered (${trail})`
		remember(messageId, {
			text: result.text,
			detected: result.detected,
			provider: result.provider,
			automatic,
		})
		return true
	} finally {
		markInFlight(messageId, false)
	}
}

/**
 * The sheet row's action: translate if it is showing the original, restore if it is not.
 */
export async function toggleTranslation(
	channelId: string,
	messageId: string,
	text: string,
) {
	if (isInFlight(messageId)) return

	if (isShowing(messageId)) {
		setShowing(messageId, false)
		repaintMessage(channelId, messageId)
		return
	}

	const cached = translationFor(messageId)
	if (cached) {
		setShowing(messageId, true)
		repaintMessage(channelId, messageId)
		return
	}

	toast('Translating…')
	const ok = await fetchTranslation(messageId, text, false)

	if (!ok) {
		const stored = translationFor(messageId)
		toast(
			stored
				? `Already in ${settings().target}`
				: 'Could not translate that — see Translate > Debug',
		)
		return
	}

	setShowing(messageId, true)
	repaintMessage(channelId, messageId)
}

/** Restores every message currently showing a translation, in the open channel. */
export function showAllOriginals(channelId: string): number {
	const ids = showingIds()
	for (const id of ids) {
		setShowing(id, false)
		repaintMessage(channelId, id)
	}
	return ids.length
}

/**
 * Redraws every translated row in the open channel, so a change to how translations are shown
 * applies to the ones already on screen rather than only to the next one.
 */
export function repaintShowing(ids: string[] = showingIds()): number {
	let channelId: string | undefined
	try {
		const id = (
			revenge.discord.flux.Stores as any
		)?.SelectedChannelStore?.getChannelId?.()
		channelId = typeof id === 'string' && id ? id : undefined
	} catch {
		channelId = undefined
	}
	if (!channelId) return 0

	let count = 0
	for (const id of ids) {
		// Ids from other channels are simply not in this channel's store, and repaintMessage
		// declines them without a dispatch.
		if (repaintMessage(channelId, id)) count++
	}
	return count
}
