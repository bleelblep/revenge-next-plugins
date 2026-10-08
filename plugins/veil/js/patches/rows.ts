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

import { readText } from '../lib/readText'
import { localReason, stickerReason } from '../lib/rules'
import { currentUserId, settings, TAG } from '../lib/state'

const SPOILER = 'spoiler'
const SUBTEXT = 'subtext'
const MARK = '🙈'
/** What the blurred media says before it is tapped, the same word Discord uses. */
const SPOILER_LABEL = 'Spoiler'

const status = { installed: false, blurred: 0 }

/**
 * Messages whose stickers the user chose to see (long-press > Show sticker), for this session.
 * Stickers have no spoiler in Discord's native row (`sticker/Sticker`: id, name, url, asset,
 * format, size -- nothing to obscure), so a hidden sticker is taken out of the row and a line
 * says so instead; this set puts it back.
 */
const revealedStickers = new Set<string>()

export function setStickersRevealed(messageId: string, revealed: boolean) {
	if (revealed) revealedStickers.add(messageId)
	else revealedStickers.delete(messageId)
}

export const stickersRevealed = (messageId: string) => revealedStickers.has(messageId)

/** A row's stickers: the `stickers` list, plus the older single `sticker` some rows still carry. */
function rowStickers(message: any): any[] {
	const list = Array.isArray(message?.stickers) ? message.stickers.filter(Boolean) : []
	if (message?.sticker && typeof message.sticker === 'object' && !list.length) list.push(message.sticker)
	return list
}

/** Takes the stickers out of a row and leaves a line in their place. Copies, never edits shared objects. */
function hideStickers(message: any, why: string) {
	if (revealedStickers.has(message.id)) return
	const stickers = rowStickers(message)
	if (!stickers.length) return
	if (Array.isArray(message.stickers)) message.stickers = []
	if (message.sticker) message.sticker = null
	const many = stickers.length > 1
	const reason = settings().showReason ? `: ${why}` : ''
	const note = {
		type: SUBTEXT,
		content: [`${MARK} ${many ? 'Stickers' : 'Sticker'} hidden${reason}. Hold the message to show ${many ? 'them' : 'it'}.`],
	}
	const content = Array.isArray(message.content) ? message.content : []
	message.content = content.length ? [...content, '\n', note] : [note]
}

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
			message.embeds = message.embeds.map((embed: any) => {
				if (!embed || typeof embed !== 'object') return embed
				const out = embed.spoiler ? { ...embed } : { ...embed, spoiler: SPOILER_LABEL }
				// A `components` embed (link fixers like kirkstagram, captured live on 348.5) is drawn
				// as component views, never through the embed view that reads `spoiler`, so the flag
				// above does nothing for it. Its container and gallery images carry their own.
				if (Array.isArray(embed.components)) out.components = embed.components.map((c: any) => spoilComponent(c))
				return out
			})
		}
		// Bot messages built from components (Components V2) have the same tree at the top level.
		if (Array.isArray(message.components)) message.components = message.components.map((c: any) => spoilComponent(c))
	}

	status.blurred++
}

const MAX_WALK_DEPTH = 8

/** Component type numbers (Discord's API): a container, and a media gallery of images or videos. */
const CONTAINER = 17
const MEDIA_GALLERY = 12

/**
 * A copy of a component tree with every container and gallery item marked as a spoiler.
 *
 * Native reads `isSpoiler` + `spoilerDescription` for both (`ContainerComponent`,
 * `MediaGalleryItem` in 348.1): a container derives its `spoilerOrNull` from a non-blank
 * `spoilerDescription`, and the whole container -- text, image and buttons -- goes under Discord's
 * own tap-to-reveal cover. Gallery items get it too, for a gallery outside any container. Copied
 * at every level, never edited in place, for the same reason as attachments above.
 */
function spoilComponent(component: any, depth = 0): any {
	if (!component || typeof component !== 'object' || depth > MAX_WALK_DEPTH) return component
	const out = { ...component }
	if (component.type === CONTAINER) {
		out.isSpoiler = true
		out.spoiler = true
		out.spoilerDescription = component.spoilerDescription || SPOILER_LABEL
	}
	if (component.type === MEDIA_GALLERY && Array.isArray(component.items)) {
		out.items = component.items.map((item: any) =>
			item && typeof item === 'object'
				? { ...item, isSpoiler: true, spoiler: true, spoilerDescription: item.spoilerDescription || SPOILER_LABEL }
				: item,
		)
	}
	if (Array.isArray(component.components)) {
		out.components = component.components.map((child: any) => spoilComponent(child, depth + 1))
	}
	return out
}

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

/**
 * The words in a link, as a reader would take them: "tenor.com/view/breaking-bad-finale-gif-123"
 * reads as "tenor com view breaking bad finale gif 123". Query strings are dropped (tracking junk,
 * not words); anything that isn't http(s) is ignored.
 */
function linkWords(url: unknown): string {
	if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return ''
	let text = url.replace(/^https?:\/\/(www\.)?/i, '').replace(/[?#].*$/, '')
	try {
		text = decodeURIComponent(text)
	} catch {
		/* left encoded */
	}
	return text.replace(/[-_/.+=&%~:]+/g, ' ').trim()
}

/** Link targets in a content-node tree (`{ type: 'link', target }` and masked links alike). */
function linkTargets(nodes: any, out: string[], depth = 0) {
	if (!Array.isArray(nodes) || depth > MAX_WALK_DEPTH) return
	for (const node of nodes) {
		if (!node || typeof node !== 'object') continue
		if (typeof node.target === 'string') out.push(linkWords(node.target))
		if (typeof node.url === 'string') out.push(linkWords(node.url))
		if (Array.isArray(node.content)) linkTargets(node.content, out, depth + 1)
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

	// Links, by the words in them. A message that is only a GIF or image link has its URL hidden
	// from the row by Discord, and a Tenor embed has no title or description, so the address was
	// the only text there was -- and 0.4.0 and earlier read none of it, so a word or described
	// rule could never catch a GIF. The page URL is used, not the media CDN ones, which carry no
	// words.
	linkTargets(message.content, parts)

	for (const embed of Array.isArray(message.embeds) ? message.embeds : []) {
		if (!embed || typeof embed !== 'object') continue
		parts.push(
			linkWords(embed.url),
			linkWords(embed.author?.url),
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
 * Why one message should be blurred. Shared by the row itself and the reply preview above it.
 * Everything is decided on the device (`lib/rules.ts`), described rules included.
 */
function judge(message: any, channelId: string): string | undefined {
	const id = message?.id
	if (typeof id !== 'string') return undefined

	const authorId = typeof message.authorId === 'string' ? message.authorId : undefined
	if (settings().skipOwn && authorId && authorId === currentUserId()) return undefined

	const text = readableText(message)

	return localReason(channelId, authorId, text)
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

const CUSTOM_EMOJI = 'customEmoji'

/**
 * A copy of [nodes] with every custom emoji a name rule matches wrapped in a spoiler of its own, or
 * undefined when none matched. Copy-on-write all the way down: the content array is Discord's parse
 * cache, shared with every other draw of this message, so it is never edited in place.
 */
function spoilEmoji(nodes: any, cache: Map<string, boolean>, depth = 0): any[] | undefined {
	if (!Array.isArray(nodes) || depth > MAX_WALK_DEPTH) return undefined
	let out: any[] | undefined
	nodes.forEach((node: any, index: number) => {
		let next = node
		if (node && typeof node === 'object') {
			if (node.type === CUSTOM_EMOJI && typeof node.alt === 'string' && node.alt) {
				let hit = cache.get(node.alt)
				if (hit === undefined) {
					hit = !!stickerReason([node.alt])
					cache.set(node.alt, hit)
				}
				if (hit) {
					next = { type: SPOILER, content: [node] }
					ours.add(next)
				}
			} else if (node.type !== SPOILER && Array.isArray(node.content)) {
				const inner = spoilEmoji(node.content, cache, depth + 1)
				if (inner) next = { ...node, content: inner }
			}
		}
		if (next !== node && !out) out = nodes.slice(0, index)
		if (out) out.push(next)
	})
	return out
}

function apply(row: any) {
	if (!settings().enabled) return
	const message = row?.message
	const channelId = message?.channelId
	if (typeof message?.id !== 'string' || typeof channelId !== 'string') return

	veilReplyPreview(message, channelId)

	const reason = judge(message, channelId)
	if (reason) veil(row, reason)
	// After veil(), so the note goes under the blurred text rather than inside the spoiler. A blurred
	// message's stickers go with it; otherwise only the rules switched to check sticker names hide one.
	const stickerWhy =
		reason && settings().blurMedia
			? reason
			: stickerReason(rowStickers(message).map((sticker: any) => (typeof sticker?.name === 'string' ? sticker.name : '')))
	if (stickerWhy) hideStickers(message, stickerWhy)
	// Custom emoji the same rules match, each behind its own spoiler. A blurred message's are
	// already inside its spoiler.
	if (!reason && Array.isArray(message.content)) {
		const spoiled = spoilEmoji(message.content, new Map())
		if (spoiled) message.content = spoiled
	}
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
