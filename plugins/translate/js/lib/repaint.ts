/**
 * Making one already-drawn message pick up a change.
 *
 * Rows cross into native once and live there afterwards, so mutating what `RowManager.generate`
 * produces only affects rows generated *from now on*. A message already on screen needs Discord's
 * own pipeline to regenerate it, and dispatching a `MESSAGE_UPDATE` for it is what does that:
 * `MessageStore` re-emits, the row regenerates, and the `after` hook on `generate` gets its
 * chance to rewrite the text.
 *
 * Screenshot Redactor does this for the whole channel at once when its toggle flips
 * (`lib/rerender.ts`, adapted there from HideBlockedAndIgnoredMessages by Zykrah and シグマ
 * siguma). This is the single-message version: a translation is one row's business, and
 * redispatching a whole channel to change one line would be both slower and more likely to
 * disturb something.
 */

import { debug } from './state'

function dispatcher(): any {
	try {
		return (revenge.discord.common as any)?.flux?.Dispatcher
	} catch {
		return undefined
	}
}

function messageFrom(channelId: string, messageId: string): any {
	try {
		const store = (revenge.discord.flux.Stores as any)?.MessageStore
		return store?.getMessage?.(channelId, messageId)
	} catch {
		return undefined
	}
}

/**
 * Asks Discord to redraw one message.
 *
 * The dispatched record is the store's own, untouched — the rewrite happens later, in the row
 * hook. Sending a modified message here would write the translation into `MessageStore`, where
 * every other part of the client would then see it as the real content.
 */
export function repaintMessage(channelId: string, messageId: string): boolean {
	const dispatch = dispatcher()
	if (typeof dispatch?.dispatch !== 'function') {
		debug('no Flux dispatcher; cannot repaint')
		return false
	}

	const message = messageFrom(channelId, messageId)
	if (!message) {
		debug(`message ${messageId} not in the store; cannot repaint`)
		return false
	}

	try {
		dispatch.dispatch({ type: 'MESSAGE_UPDATE', message })
		return true
	} catch (error) {
		// Some stores subscribed to MESSAGE_UPDATE throw on a payload they did not expect. The
		// dispatch that reaches MessageStore is the one that matters.
		debug('MESSAGE_UPDATE dispatch threw:', error)
		return false
	}
}
