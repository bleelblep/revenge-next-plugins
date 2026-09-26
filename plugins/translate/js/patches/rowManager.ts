/**
 * Rewriting the row as it is generated.
 *
 * `RowManager.generate` turns a message record into the plain object that crosses to native. An
 * `after` hook on it is the last point where the text can be changed before it leaves JS, and the
 * change never touches `MessageStore` — so the real message is intact everywhere else in the
 * client, and switching the translation off puts the row back exactly as it was.
 *
 * ## `after`, not `instead`
 *
 * `custom-timestamps` owns the one `instead` hook on this method, and a second one can infinitely
 * recurse (porting rule 2). `after` receives the generated row, which is all this needs, and
 * `before`/`after` chains compose safely with any number of plugins. `show-tag` sits on the same
 * method the same way.
 *
 * The hook's return value is assigned unconditionally, so it returns the row on every path,
 * including when something throws.
 */

import { nameForDetected } from '../lib/languages'
import { providerById } from '../lib/providers'
import { readText } from '../lib/rewrite'
import { debug, settings } from '../lib/state'
import { activeTranslation } from '../lib/translations'
import type { Translation } from '../lib/translations'

/** Reported on the Debug page: whether the hook installed, and whether it has ever rewritten. */
const status = { installed: false, rewrites: 0 }

export function rowStatus(): { installed: boolean; rewrites: number } {
	return { ...status }
}

/** The text of a generated row, for the sheet to offer and the auto sweep to judge. */
export function textOfRow(message: any): string {
	if (!message) return ''
	if (Array.isArray(message.content)) {
		const text = readText(message.content)
		if (text) return text
	}
	return typeof message.content === 'string' ? message.content : ''
}

/**
 * The note under a translation, as a real `-#` subtext line.
 *
 * Built as a content node rather than written as markdown: the text lands in an already-parsed
 * content tree, so a literal "-# " would be shown as those three characters. The node shape is
 * confirmed from the native deserializer rather than guessed --
 * `com/discord/chat/bridge/contentnode/SubtextContentNode$$serializer` registers the serial name
 * `"subtext"` with one required field, `content: List<ContentNode>`. The child is a bare string,
 * which `ContentNodeSerializer.deserialize` turns into a `TextContentNode` on sight (it maps any
 * JSON primitive straight to one).
 *
 * Read from settings at generation time, so flipping a switch changes rows already on screen once
 * they are repainted, not only translations made afterwards.
 */
function noteFor(translation: Translation): string | undefined {
	const s = settings()
	const notes: string[] = []
	if (s.markTranslated) notes.push('🌐 Translated')
	if (s.showDetected && translation.detected)
		notes.push(`from ${nameForDetected(translation.detected)}`)
	if (s.showProvider)
		notes.push(providerById(translation.provider)?.name ?? translation.provider)
	if (!notes.length) return undefined
	// With the marker off, the details still need something to hang off.
	return `${s.markTranslated ? '' : '🌐 '}${notes.join(' · ')}`
}

const SUBTEXT = 'subtext'

/**
 * Android colour ints, as signed 32-bit values.
 *
 * The native fields are `Integer`, and React Native's own `processColor` hands Android colours
 * over signed (`int32Color | 0x0`). An opaque colour is above 2^31 as an unsigned number, which
 * would not fit a Kotlin `Int` and could fail the whole row's deserialization -- hence `| 0`.
 */
const argb = (value: number) => value | 0

/** A soft blue wash and a solid blue gutter bar, like a mention highlight but blue. */
const HIGHLIGHT = {
	backgroundColor: argb(0x1f4a9eff),
	gutterColor: argb(0xff4a9eff),
}

/**
 * Marks the row with a background highlight.
 *
 * `MessageRow.backgroundHighlight` is the row-level field
 * (`com/discord/chat/bridge/row/MessageRow$$serializer`), shaped as
 * `BackgroundHighlight { backgroundColor?: Int, gutterColor?: Int }` -- the same mechanism that
 * paints a message that mentions you. An existing highlight is never replaced: a mention or a
 * jump target is more important to see than the fact of a translation.
 */
function highlight(row: any) {
	if (!settings().highlightTranslated) return
	if (row.backgroundHighlight) return
	row.backgroundHighlight = { ...HIGHLIGHT }
}

function apply(row: any): void {
	const message = row?.message
	const id = message?.id
	if (typeof id !== 'string' || !id) return

	const translation = activeTranslation(id)
	if (!translation || !Array.isArray(message.content)) return

	const note = noteFor(translation)

	// A brand-new content array, never an edit of the old one. `message.content` is Discord's
	// per-message parse cache (`parseMessageMarkup` memoizes it per record); writing into it is
	// what made "Show original" stick. The row object is fresh per generation, so replacing the
	// property leaves the cache -- and every later regeneration without a translation -- untouched.
	//
	// One plain string rather than the original nodes with their text swapped: the translation
	// already carries mentions, emoji and links in readable form (`lib/tokens.ts`), so keeping the
	// original nodes as well showed each of them twice. A bare string is a confirmed shape --
	// `ContentNodeSerializer.deserialize` turns any JSON primitive into a TextContentNode -- and a
	// newline inside it is known to render, so the note needs no separate line-break node.
	const content: any[] = [note ? `${translation.text}\n` : translation.text]
	if (note) content.push({ type: SUBTEXT, content: [note] })

	const changed = readText(message.content) !== translation.text
	message.content = content

	highlight(row)

	if (changed) status.rewrites++
}

/**
 * Patches one RowManager class. There is more than one in the bundle, and they are patched
 * independently -- the same shape Screenshot Redactor and Show Tag use.
 */
function patchOne(RowManager: any, patches: Array<() => void>) {
	patches.push(
		revenge.patcher.after(RowManager.prototype, 'generate', (row: any) => {
			try {
				apply(row)
			} catch (error) {
				console.error('[Translate] row rewrite failed:', error)
			}
			// Assigned unconditionally by the patcher, so it must be returned on every path.
			return row
		}),
	)
}

export default function patchRowManager(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const patches: Array<() => void> = []
	const seen = new WeakSet<any>()

	// `withName`, and the callback receives the class itself -- matching what Screenshot Redactor
	// and Show Tag do on this same method. `getModules` rather than `lookupModule`, because
	// RowManager is chat UI and may not be initialized at start() (porting rule 3); `max: 10`
	// because there are several RowManager classes and each needs its own hook.
	const unsub = getModules(
		withName('RowManager'),
		(RowManager: any) => {
			if (typeof RowManager?.prototype?.generate !== 'function') return
			if (seen.has(RowManager)) return
			seen.add(RowManager)

			patchOne(RowManager, patches)
			status.installed = true
			// Log the outcome, not the attempt -- porting rule 3.
			console.log('[Translate] rewriting rows through a RowManager.generate')
		},
		{ max: 10 },
	)

	patches.push(unsub)

	return () => {
		status.installed = false
		status.rewrites = 0
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
		debug('row hook removed')
	}
}
