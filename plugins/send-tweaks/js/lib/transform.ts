/**
 * Everything that happens to a message's text on the way out, in one place.
 *
 * Shared by the send hook, the edit hook and the settings page's "try a message" box, so the
 * preview can never disagree with what actually gets sent.
 *
 * Order matters: links are cleaned before your rules run, so a rule that rewrites a domain sees
 * the clean link, and a rule can never accidentally reintroduce tracking that was just removed
 * without you writing it in yourself.
 */

import { cleanText } from './cleanUrls'
import { mapOutsideCode } from './codeSpans'
import { settings } from './state'
import { applyRules } from './textReplace'

export interface TransformResult {
	text: string
	/** Tracking parameters removed. */
	cleaned: number
	/** Rules that changed something. */
	replaced: number
}

export function transform(text: string): TransformResult {
	const s = settings()
	let cleaned = 0
	let replaced = 0

	const out = mapOutsideCode(text, prose => {
		let next = prose
		if (s.cleanUrls) {
			const result = cleanText(next)
			next = result.text
			cleaned += result.removed
		}
		if (s.textReplace && s.rules.length) {
			const result = applyRules(next, s.rules)
			next = result.text
			replaced += result.applied
		}
		return next
	})

	return { text: out, cleaned, replaced }
}
