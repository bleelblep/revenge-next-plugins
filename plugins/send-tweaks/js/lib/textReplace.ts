/**
 * Your own find-and-replace rules, applied as you send.
 *
 * Rules run in order, each over the output of the one before, so a rule can build on another.
 * They run outside code spans (see `codeSpans.ts`) for the same reason link cleaning does: text
 * inside a code block is meant to be shown exactly.
 *
 * ## A broken rule never costs you a message
 *
 * A regex rule is compiled when it runs, and one that will not compile is skipped rather than
 * thrown. `compileRule` reports why, so the rules page can show the error next to the rule it
 * belongs to instead of the send path discovering it.
 */

export interface Rule {
	/** Stable id, so the settings list can key and edit rules without relying on position. */
	id: string
	find: string
	replace: string
	/** Treat `find` as a regular expression rather than literal text. */
	regex: boolean
	caseSensitive: boolean
	/** Only match whole words: "cat" matches "cat" but not "concatenate". Literal rules only. */
	wholeWord: boolean
	enabled: boolean
}

export function newRule(): Rule {
	return {
		id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
		find: '',
		replace: '',
		regex: false,
		caseSensitive: false,
		wholeWord: true,
		enabled: true,
	}
}

const escapeRegex = (text: string) =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export type Compiled =
	| { pattern: RegExp; error?: undefined }
	| { pattern?: undefined; error: string }

export function compileRule(rule: Rule): Compiled {
	if (!rule.find) return { error: 'Nothing to find' }

	const flags = rule.caseSensitive ? 'g' : 'gi'
	try {
		if (rule.regex) return { pattern: new RegExp(rule.find, flags) }

		const literal = escapeRegex(rule.find)
		// `\b` only means something next to a word character; a rule for "->" or ":)" with
		// whole-word on would otherwise never match anything.
		const edge = (char: string) => (/\w/.test(char) ? '\\b' : '')
		const body = rule.wholeWord
			? `${edge(rule.find[0])}${literal}${edge(rule.find[rule.find.length - 1])}`
			: literal
		return { pattern: new RegExp(body, flags) }
	} catch (error) {
		return { error: error instanceof Error ? error.message : String(error) }
	}
}

/** Guards against a regex that matches the empty string and would loop or explode the text. */
function safeReplace(
	text: string,
	pattern: RegExp,
	replacement: string,
): string {
	if (pattern.test('')) return text
	pattern.lastIndex = 0
	return text.replace(pattern, replacement)
}

export function applyRules(
	text: string,
	rules: Rule[],
): { text: string; applied: number } {
	let out = text
	let applied = 0

	for (const rule of rules) {
		if (!rule.enabled) continue
		const compiled = compileRule(rule)
		if (!compiled.pattern) continue

		const next = safeReplace(out, compiled.pattern, rule.replace)
		if (next !== out) {
			applied++
			out = next
		}
	}

	return { text: out, applied }
}
