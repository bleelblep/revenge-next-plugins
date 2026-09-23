/**
 * The plain text of a row's content-node tree, as the message reads.
 *
 * Copied from Translate's `lib/rewrite.ts`. Rules match against this rather than the store's
 * `content` string because the row is what is about to be drawn -- after Translate, for one,
 * has already rewritten it.
 */

const MAX_DEPTH = 12

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
