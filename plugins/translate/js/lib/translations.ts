/**
 * What has been translated, and what is currently showing.
 *
 * Translation used to arrive as a second, clientside message underneath the original. Rewriting
 * the row in place is better for the obvious reason — it reads as the message, not as a reply to
 * it — and for a less obvious one: it makes "undo" meaningful. A separate message can only be
 * deleted; a rewritten row can be put back exactly as it was, from the same button that changed
 * it.
 *
 * Two pieces of state per message, and they are deliberately separate:
 *
 * - the **translation**, which is expensive and is kept once fetched, so toggling back and forth
 *   costs nothing after the first time
 * - whether it is **showing**, which is free and is what the sheet row toggles
 *
 * Memory only. A translation is a view of somebody else's message and has no business surviving
 * a restart, and the row it belongs to will be regenerated from scratch anyway.
 */

import type { ProviderId } from './providers'

export interface Translation {
	text: string
	detected?: string
	provider: ProviderId
	/** True when it was translated without being asked, by the auto sweep. */
	automatic: boolean
}

/** Bounded so a long session cannot accumulate a copy of every channel visited. */
const MAX_CACHED = 400

const translations = new Map<string, Translation>()
const showing = new Set<string>()
/** Messages currently being fetched, so a double tap cannot fire two requests. */
const inFlight = new Set<string>()

export function translationFor(messageId: string): Translation | undefined {
	return translations.get(messageId)
}

export function isShowing(messageId: string): boolean {
	return showing.has(messageId)
}

export function isInFlight(messageId: string): boolean {
	return inFlight.has(messageId)
}

export function markInFlight(messageId: string, value: boolean) {
	if (value) inFlight.add(messageId)
	else inFlight.delete(messageId)
}

export function remember(messageId: string, translation: Translation) {
	if (translations.size >= MAX_CACHED) {
		const oldest = translations.keys().next().value
		if (oldest !== undefined) {
			translations.delete(oldest)
			showing.delete(oldest)
		}
	}
	translations.set(messageId, translation)
}

export function setShowing(messageId: string, value: boolean) {
	if (value) showing.add(messageId)
	else showing.delete(messageId)
}

/** The translation to render for this row, or undefined to leave the original alone. */
export function activeTranslation(messageId: string): Translation | undefined {
	return showing.has(messageId) ? translations.get(messageId) : undefined
}

/** Everything currently showing a translation, for the "show all originals" action. */
export function showingIds(): string[] {
	return [...showing]
}

export function resetTranslations() {
	translations.clear()
	showing.clear()
	inFlight.clear()
}
