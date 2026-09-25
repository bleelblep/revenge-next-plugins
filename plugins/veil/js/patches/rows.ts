/**
 * Blurring a row as it is generated, with Discord's own spoiler.
 *
 * ## Nothing is drawn by this plugin
 *
 * The message text is wrapped in a real spoiler node, and attachments and embeds get Discord's
 * own spoiler flags, so what appears is exactly what a `||spoiler||` looks like: native look,
 * native tap-to-reveal. The shapes are from the native deserializers in 348.1:
 *
 * - `contentnode/SpoilerContentNode$$serializer`: serial name `"spoiler"`, one field,
 *   `content: List<ContentNode>` -- any existing nodes can go inside unchanged.
 * - `attachment/Attachment`: `isSpoiler: boolean` (required) and `spoiler: String?`.
 * - `embed/Embed`: `spoiler: String?`.
 *
 * ## Revealing survives a redraw
 *
 * Tapping a text spoiler is handled natively: `SpoilerManager` keeps a set of revealed ids, and
 * the id is `spoiler:<messageId>:<node.hashCode()>:<index>`. `SpoilerContentNode` is a Kotlin data
 * class, so its hash comes from its content -- a row regenerated with the same text keeps the
 * reveal, and this hook does not have to track taps at all.
 *
 * ## `after`, like Translate and Show Tag
 *
 * `custom-timestamps` owns the one `instead` hook on `generate` (porting rule 2). Whether this
 * runs before or after Translate does not matter: Translate's `writeText` descends into nested
 * content, so it translates the text inside the spoiler just the same.
 */

import { aiVerdict, enqueue, shouldCheck } from '../lib/classify'
import { readText } from '../lib/readText'
import { localReason } from '../lib/rules'
import { currentUserId, settings, TAG } from '../lib/state'

const SPOILER = 'spoiler'
const SUBTEXT = 'subtext'
const MARK = '🙈'
/** What the blurred media says before it is tapped, the same word Discord uses. */
const SPOILER_LABEL = 'Spoiler'

const status = { installed: false, blurred: 0, queued: 0 }

export function rowStatus() {
	return { ...status }
}

/**
 * Spoiler nodes this plugin made. A WeakSet rather than a marker key on the node, so nothing that
 * crosses to native carries a field the deserializer has never seen.
 */
const ours = new WeakSet<object>()

function veil(row: any, reason: string) {
	const message = row.message
	const s = settings()

	if (Array.isArray(message.content) && message.content.length) {
		// Rows are generated fresh each time, so this only guards a row passing through twice.
		if (ours.has(message.content[0])) return
		const node = { type: SPOILER, content: message.content }
		ours.add(node)
		const wrapped: any[] = [node]
		if (s.showReason) {
			wrapped.push('\n', { type: SUBTEXT, content: [`${MARK} Blurred: ${reason}`] })
		}
		message.content = wrapped
	}

	if (s.blurMedia) {
		// `??=` was wrong here. Captured from a live row on 348.1, an ordinary image arrives as
		// `{ isSpoiler: false, spoiler: "", obscure: false }` -- an empty *string*, not null, so
		// `??=` never assigned and the label was never set. Assign outright, and only leave a
		// label Discord already put there alone.
		//
		// Copied rather than edited in place: the row object is fresh per generation, but what it
		// points at may be shared with Discord's caches -- the text content provably is
		// (`parseMessageMarkup` memoizes it per record), and a blur written into a cache would
		// outlive un-veiling. Copies cost nothing and make that impossible.
		if (Array.isArray(message.attachments)) {
			message.attachments = message.attachments.map((attachment: any) =>
				attachment && typeof attachment === 'object'
					? { ...attachment, isSpoiler: true, spoiler: attachment.spoiler || SPOILER_LABEL }
					: attachment,
			)
		}
		if (Array.isArray(message.embeds)) {
			message.embeds = message.embeds.map((embed: any) =>
				embed && typeof embed === 'object' && !embed.spoiler
					? { ...embed, spoiler: SPOILER_LABEL }
					: embed,
			)
		}
	}

	status.blurred++
}

const MAX_WALK_DEPTH = 8

/** Every string under a value, for bot components whose shape varies by component type. */
function strings(value: any, out: string[], depth = 0) {
	if (depth > MAX_WALK_DEPTH || value == null) return
	if (typeof value === 'string') {
		out.push(value)
		return
	}
	if (Array.isArray(value)) {
		for (const item of value) strings(item, out, depth + 1)
		return
	}
	if (typeof value === 'object') {
		for (const [key, item] of Object.entries(value)) {
			// URLs and ids are not what anyone reads, and would only cause false matches.
			if (/url|id$|^id|color|type|style|hash/i.test(key)) continue
			strings(item, out, depth + 1)
		}
	}
}

function textOfNode(value: any): string {
	if (typeof value === 'string') return value
	if (Array.isArray(value)) return readText(value)
	return ''
}

/**
 * Everything a reader of this row would read, not only the message text. Link previews and bot
 * embeds carry their words in the embed (title, description, fields, author, footer), and bot
 * layouts in `components`; checking `content` alone let all of those through.
 */
function readableText(message: any): string {
	const parts: string[] = [readText(message.content)]

	for (const embed of Array.isArray(message.embeds) ? message.embeds : []) {
		if (!embed || typeof embed !== 'object') continue
		parts.push(
			textOfNode(embed.rawTitle),
			textOfNode(embed.rawDescription),
			textOfNode(embed.description),
			textOfNode(embed.author?.name),
			textOfNode(embed.provider?.name),
			textOfNode(embed.footer?.content ?? embed.footer?.text),
		)
		for (const field of Array.isArray(embed.fields) ? embed.fields : []) {
			parts.push(textOfNode(field?.rawName ?? field?.name), textOfNode(field?.rawValue ?? field?.value))
		}
	}

	for (const attachment of Array.isArray(message.attachments) ? message.attachments : []) {
		parts.push(textOfNode(attachment?.filename), textOfNode(attachment?.description))
	}

	if (message.components) strings(message.components, parts)

	return parts.filter(Boolean).join('\n')
}

/**
 * Why one message should be blurred, and queues it for the custom category if that is still
 * unknown. Shared by the row itself and the reply preview above it.
 */
function judge(message: any, channelId: string): string | undefined {
	const id = message?.id
	if (typeof id !== 'string') return undefined

	const authorId = typeof message.authorId === 'string' ? message.authorId : undefined
	if (settings().skipOwn && authorId && authorId === currentUserId()) return undefined

	const text = readableText(message)

	const local = localReason(channelId, authorId, text)
	if (local) return local

	const verdict = aiVerdict(id, message.editedTimestamp)
	if (verdict === true) return settings().customCategory.trim()
	if (verdict === undefined && shouldCheck(channelId, text)) {
		// Drawn normally now; repainted blurred if it comes back flagged. See lib/classify.ts.
		enqueue(channelId, id, text, message.editedTimestamp)
		status.queued++
	}
	return undefined
}

/**
 * The quoted preview above a reply is its own copy of the original message
 * (`referencedMessage: { message, systemContent }`, from `LoadedReferencedMessage`), drawn from
 * the reply's row. Blurring only the original's own row left its text readable there.
 */
function veilReplyPreview(message: any, channelId: string) {
	const reference = message.referencedMessage
	const quoted = reference?.message
	if (!quoted || !Array.isArray(quoted.content) || !quoted.content.length) return
	if (ours.has(quoted.content[0])) return
	if (!judge(quoted, typeof quoted.channelId === 'string' ? quoted.channelId : channelId)) return

	// Copied, never mutated in place. The quoted message can be the same object Discord holds
	// elsewhere -- it is the original message, not a fresh row -- and editing it would change
	// that message everywhere it is drawn (Screenshot Redactor learned this the hard way on the
	// Fabric path). Replacing the reference's own `message` keeps the change to this one row.
	const node = { type: SPOILER, content: quoted.content }
	ours.add(node)
	reference.message = { ...quoted, content: [node] }
	status.blurred++
}

function apply(row: any) {
	if (!settings().enabled) return
	const message = row?.message
	const channelId = message?.channelId
	if (typeof message?.id !== 'string' || typeof channelId !== 'string') return

	veilReplyPreview(message, channelId)

	const reason = judge(message, channelId)
	if (reason) veil(row, reason)
}

export default function patchRows(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const patches: Array<() => void> = []
	const seen = new WeakSet<any>()

	// Same lookup as Translate: several RowManager classes exist and each needs its own hook, and
	// RowManager may not be initialized at start() (porting rule 3).
	const unsub = getModules(
		withName('RowManager'),
		(RowManager: any) => {
			if (typeof RowManager?.prototype?.generate !== 'function') return
			if (seen.has(RowManager)) return
			seen.add(RowManager)

			patches.push(
				revenge.patcher.after(RowManager.prototype, 'generate', (row: any) => {
					try {
						apply(row)
					} catch (error) {
						console.error(`${TAG} row blur failed:`, error)
					}
					// Assigned unconditionally by the patcher, so returned on every path.
					return row
				}),
			)
			status.installed = true
			console.log(`${TAG} blurring rows through a RowManager.generate`)
		},
		{ max: 10 },
	)
	patches.push(unsub)

	return () => {
		status.installed = false
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
