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

/** A repeat at `at` (`+`, `*`, `{n,}`, `{n,m}`, each optionally lazy), or undefined. */
function repeatAt(source: string, at: number): string | undefined {
	return /^(?:[+*]|\{\d+,\d*\})\??/.exec(source.slice(at))?.[0]
}

/**
 * Whether a pattern has a group containing a repeat that is itself repeated: `(a+)+`, `(\w*)*`,
 * `((x+))+`, `(?:a|b+){2,}`. Scanned rather than matched with one regex so nesting, escapes and
 * character classes are followed properly. Deliberately a little over-eager -- bounded repeats count
 * too: refusing a safe rule costs a rewrite, while allowing a catastrophic one costs a frozen app.
 */
export function hasNestedRepeat(source: string): boolean {
	// One entry per open group: whether anything inside it repeats.
	const groups: boolean[] = []
	const markParent = () => {
		if (groups.length) groups[groups.length - 1] = true
	}
	let inClass = false

	for (let i = 0; i < source.length; i++) {
		const char = source[i]
		if (char === '\\') {
			i++ // the escaped character is a plain atom
			continue
		}
		if (inClass) {
			if (char === ']') inClass = false
			continue
		}
		if (char === '[') {
			inClass = true
			continue
		}
		if (char === '(') {
			groups.push(false)
			continue
		}
		if (char === ')') {
			const repeatsInside = groups.pop() ?? false
			const repeat = repeatAt(source, i + 1)
			if (repeat && repeatsInside) return true
			if (repeat || repeatsInside) markParent()
			if (repeat) i += repeat.length
			continue
		}
		const repeat = repeatAt(source, i)
		if (repeat) {
			markParent()
			i += repeat.length - 1
		}
	}
	return false
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
		if (rule.regex) {
			// Rules run synchronously on the send path, and this engine has no regex time limit:
			// a repeat inside a repeat -- `(a+)+`, `(\w*)*`, `(x+){2,}` -- can backtrack for
			// minutes on an ordinary message and freeze the app mid-send. Refuse those up front,
			// where the rules page can say why, rather than discovering it while sending.
			if (hasNestedRepeat(rule.find)) {
				return {
					error:
						'A repeat inside a repeat, like (a+)+, can freeze sending. Rewrite it without the outer repeat.',
				}
			}
			return { pattern: new RegExp(rule.find, flags) }
		}

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

/**
 * Guards against a regex that matches empty text in more than one place, like `x*` or `\b`, which
 * would insert its replacement between letters all through the message. An empty match in one
 * place is fine and is how `^` and `$` rules add text to the start or end of a message.
 */
function safeReplace(
	text: string,
	pattern: RegExp,
	replacement: string,
): string {
	// A plain exec loop rather than `matchAll`, which not every Hermes build has.
	let emptyMatches = 0
	pattern.lastIndex = 0
	for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
		if (match[0] !== '') continue
		if (++emptyMatches > 1) return text
		pattern.lastIndex++ // step past an empty match, or exec finds it forever
	}
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

		// A plain-text rule's replacement is plain text too: without escaping, `$&`, `$1` or `$$`
		// in it would be read as substitution codes, and a replacement of "$$" would send "$".
		const replacement = rule.regex ? rule.replace : rule.replace.replace(/\$/g, '$$$$')
		const next = safeReplace(out, compiled.pattern, replacement)
		if (next !== out) {
			applied++
			out = next
		}
	}

	return { text: out, applied }
}
