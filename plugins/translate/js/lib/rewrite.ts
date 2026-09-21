/**
 * Putting translated text into a row, and taking it back out.
 *
 * A message's prose lives in `text` content nodes. The whole translation goes into the first one
 * and the rest are emptied, which is the same approach Screenshot Redactor takes for names — a
 * translation is one string and cannot be split back across nodes that were created by parsing
 * the *original*, since the sentence boundaries have moved.
 *
 * Nodes carrying a `userId` are left alone: those are mentions, and a translated `@Name` is a
 * broken mention rather than a translated one. Links are skipped for the same reason.
 */

const MAX_DEPTH = 12

/** Content-node types that must survive untranslated. */
function isUntouchable(node: any): boolean {
	if (typeof node?.userId === 'string' && node.userId) return true
	const type = typeof node?.type === 'string' ? node.type.toLowerCase() : ''
	return type.includes('link') || type.includes('url') || type.includes('emoji')
}

/**
 * Writes `text` into the first plain string node and empties the others.
 *
 * @returns whether anything changed.
 */
export function writeText(nodes: any, text: string, depth = 0): boolean {
	if (!Array.isArray(nodes) || depth > MAX_DEPTH) return false

	let changed = false
	let first = true

	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		if (isUntouchable(node)) continue

		if (typeof node.content === 'string') {
			const replacement = first ? text : ''
			first = false
			if (node.content !== replacement) {
				node.content = replacement
				changed = true
			}
		} else if (Array.isArray(node.content)) {
			if (writeText(node.content, first ? text : '', depth + 1)) {
				changed = true
				first = false
			}
		}
	}

	return changed
}

/** The plain text of a content-node tree, as the message reads. */
export function readText(nodes: any, depth = 0): string {
	if (!Array.isArray(nodes) || depth > MAX_DEPTH) return ''

	const parts: string[] = []
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		if (typeof node.content === 'string') parts.push(node.content)
		else if (Array.isArray(node.content))
			parts.push(readText(node.content, depth + 1))
	}
	return parts.join('')
}
