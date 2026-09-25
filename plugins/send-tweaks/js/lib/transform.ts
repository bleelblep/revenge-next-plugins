/**
 * Everything that happens to a message's text on the way out, in one place.
 *
 * Shared by the send hook, the edit hook and the settings page's "try a message" box, so the
 * preview can never disagree with what actually gets sent.
 *
 * Links are cleaned first (outside code), then your link rules run inside each link -- the place for
 * rewrites like twitter.com to fxtwitter.com. Your text rules then run over the whole message with code,
 * links, mentions, custom emoji and timestamps held aside, so a rule for a common word can never
 * break a link or a mention that happens to contain it, and `^` / `$` still mean the start and end.
 */

import { cleanText, mapUrls } from './cleanUrls'
import { mapOutsideCode, mapOutsideProtected, transformAroundProtected } from './codeSpans'
import { settings } from './state'
import { applyRules } from './textReplace'

export interface TransformResult {
	text: string
	/** Tracking parameters removed. */
	cleaned: number
	/** Text rules that changed something. */
	replaced: number
	/** Links a link rule changed. */
	rewritten: number
}

export function transform(text: string): TransformResult {
	const s = settings()
	let cleaned = 0
	let replaced = 0
	let rewritten = 0
	let out = text

	if (s.cleanUrls) {
		out = mapOutsideCode(out, prose => {
			const result = cleanText(prose)
			cleaned += result.removed
			return result.text
		})
	}

	const linkRules = s.linkRules ?? []
	if (s.linkRewrite && linkRules.length) {
		// Inside links only, never inside code -- the opposite of text rules, which skip links.
		out = mapOutsideCode(out, prose =>
			mapUrls(prose, url => {
				const result = applyRules(url, linkRules)
				if (result.text !== url) rewritten++
				return result.text
			}),
		)
	}

	if (s.textReplace && s.rules.length) {
		// Over the whole message with code, mentions, emoji, timestamps and links held aside, so
		// `^` and `$` mean the start and end of the message (see codeSpans.ts).
		let applied = 0
		const whole = transformAroundProtected(out, masked => {
			const result = applyRules(masked, s.rules)
			applied = result.applied
			return result.text
		})
		if (whole !== undefined) {
			out = whole
			replaced += applied
		} else {
			// A rule reached into a placeholder. Run the rules between the protected spans
			// instead: anchors then see each stretch alone, but nothing protected can break.
			out = mapOutsideProtected(out, words => {
				const result = applyRules(words, s.rules)
				replaced += result.applied
				return result.text
			})
		}
	}

	return { text: out, cleaned, replaced, rewritten }
}
