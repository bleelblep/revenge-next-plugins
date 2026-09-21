/**
 * Leaving code alone.
 *
 * A link inside a code block is almost always there to be read exactly as written — a config
 * value, a curl command, a bug report quoting the URL that broke. Cleaning it or running a text
 * replacement over it would change what the person meant to show. So both transforms run only
 * over the prose between code spans.
 *
 * Fenced blocks (```) are matched before inline code (`), so a backtick inside a fence does not
 * open an inline span.
 */

const CODE = /```[\s\S]*?```|`[^`\n]+`/g

/**
 * Applies `transform` to every stretch of text that is not code, and stitches the result back
 * together with the code untouched.
 */
export function mapOutsideCode(
	text: string,
	transform: (prose: string) => string,
): string {
	let out = ''
	let last = 0

	CODE.lastIndex = 0
	for (let match = CODE.exec(text); match; match = CODE.exec(text)) {
		out += transform(text.slice(last, match.index))
		out += match[0]
		last = match.index + match[0].length
	}

	return out + transform(text.slice(last))
}
