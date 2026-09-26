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

/**
 * A private copy of a row's content tree, safe to rewrite.
 *
 * The array a generated row carries is **Discord's parse cache**, not a fresh parse:
 * `parseMessageMarkup` (`modules/messages/native/renderer/MarkupParsers.tsx`, 348.x) memoizes its
 * result per message record and hands the same object back on every regeneration. Rewriting it in
 * place wrote the translation into the cache itself, so "Show original" redrew the message from a
 * cache that still held the translation -- the revert stuck, for as long as the store kept the same
 * record. Every edit goes into a copy instead.
 *
 * Content nodes cross to native as JSON, so a plain structural copy of arrays and objects is
 * complete; anything else (strings, numbers, booleans, null) is shared as-is.
 */
export function cloneContent<T>(value: T, depth = 0): T {
	if (depth > MAX_DEPTH * 2 || value === null || typeof value !== 'object') return value
	if (Array.isArray(value))
		return value.map(entry => cloneContent(entry, depth + 1)) as unknown as T
	const copy: Record<string, unknown> = {}
	for (const key of Object.keys(value as object))
		copy[key] = cloneContent((value as Record<string, unknown>)[key], depth + 1)
	return copy as T
}

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
