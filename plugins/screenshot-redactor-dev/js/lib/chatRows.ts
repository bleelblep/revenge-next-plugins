/**
 * Getting already-drawn messages to pick up the toggle.
 *
 * ## Why the old `emitChange` nudge could never have worked
 *
 * The message list is not a React tree that can be re-rendered. `RowManager.generate` produces
 * plain row objects, JS serializes them, and they cross into native exactly once through
 * `DCDChatManager.updateRows(tag, rowsJSON, isLoadingAtTop)`. From that moment the rows live in
 * Kotlin, in `ChatListManager`'s own `List<Row>`, and JS has no further say in what is on screen.
 *
 * `ChatModule` (`com/discord/chat/ChatModule.java`) exposes exactly two methods that can change
 * what is displayed — `updateRows` and `clearRows` — and `ChatListManager.updateRows` is a
 * *delta*, not a repaint: each row carries a `changeType` and an `index`, and native splices them
 * into the list it already has.
 *
 * So nudging a Flux store was never going to do anything. Even if the store emitted and every
 * subscriber re-rendered, nothing would cross the bridge, because JS only pushes rows that
 * actually changed — and none had. Switching channels worked because it is the one thing that
 * makes JS push a *complete* list, which native takes through `createNewRows` instead.
 *
 * ## What this does instead
 *
 * Mirror the row list on the JS side, exactly as `ChatListManager` maintains it, then repaint on
 * demand by clearing native's list and pushing the mirror back as a fresh sync. `clearRows` sets
 * native's `rows` to null, which sends the next `updateRows` down the `createNewRows` path — a
 * whole-list replace where only the order matters, not the indices. That is deliberately the
 * forgiving path: if the mirror is subtly wrong the chat looks wrong until the next real sync,
 * rather than having its indices scrambled the way an `UPDATE`-at-index repaint would.
 *
 * The mirror holds **unredacted** rows on purpose. It is what the chat would look like with the
 * plugin off, so toggling redaction back off restores the real names without a channel switch
 * too. It is memory-only and dropped when the plugin stops, for the same reason the alias map is
 * (see `lib/alias.ts`) — though note it is a copy of the visible conversation, so it is the one
 * piece of state in this plugin worth remembering exists.
 */

import { ChangeType, redactRows } from "./rowSchema"
import { count, noteRefreshOutcome } from "./diagnostics"
import { nudgeStores } from "./nudge"
import { rerenderViaFlux } from "./rerender"
import { currentUserId, isEnabled, settings } from "./state"

interface TagState {
	/** `undefined` mirrors native's `rows == null`, i.e. "the next batch is a full sync". */
	rows: any[] | undefined
	/**
	 * Whether this mirror is believed to hold the *whole* list rather than a fragment.
	 *
	 * The mirror starts empty, but native's list does not: if the plugin is enabled while a
	 * channel is already open, native already holds rows we never saw, and the first batch we do
	 * see is a delta. Treating that delta as a full sync would leave the mirror holding two or
	 * three rows — and a repaint would then replace an entire conversation with them.
	 *
	 * So a mirror is only repainted once we're confident it is complete: either we watched
	 * `clearRows` empty it first, or the batch we adopted looks like a whole list.
	 */
	trusted: boolean
}

/**
 * Bounded so that a long session spent hopping between channels can't accumulate a copy of every
 * conversation visited. Oldest tag goes first; losing a mirror only costs that list its repaint
 * until the next full sync rebuilds it.
 */
const MAX_TAGS = 8

const tags = new Map<number, TagState>()

/** Set while re-pushing our own rows, so the hook doesn't mirror what it just sent. */
let replaying = false

export function isReplaying() {
	return replaying
}

function stateFor(tag: number): TagState {
	let state = tags.get(tag)
	if (!state) {
		state = { rows: undefined, trusted: false }
		tags.set(tag, state)

		// Map iterates in insertion order, so the first key is the least recently opened list.
		while (tags.size > MAX_TAGS) {
			const oldest = tags.keys().next()
			if (oldest.done) break
			tags.delete(oldest.value)
		}
	}
	return state
}

const isDelete = (row: any) => row?.changeType === ChangeType.DELETE
const isInsert = (row: any) => row?.changeType === ChangeType.INSERT
const isLoadingRow = (row: any) => row?.button != null && row?.isLoading !== undefined

/**
 * Whether a batch has the shape native's `createNewRows` path expects: no deletes (that path
 * throws on them), and a complete run of inserts starting at index 0.
 *
 * Deliberately conservative. Guessing "complete" when the batch was a fragment is the one
 * mistake that produces a visibly wrong conversation; guessing "fragment" when it was complete
 * only costs a repaint, and the user gets the old "reopen the channel" toast instead.
 */
function looksLikeFullSync(rows: any[]): boolean {
	if (rows.length === 0) return false
	return rows.every((row, i) => isInsert(row) && row?.index === i)
}

/**
 * Applies one batch to the mirror, following `ChatListManager.modifyExistingRows` step for step:
 * inserts first in order, then deletes and updates **in reverse**, with the one special case for
 * a load-more row arriving on top of a spinner. Getting this wrong desyncs the mirror, so it is a
 * transcription rather than an interpretation.
 */
export function applyBatch(tag: number, rows: any[]) {
	const state = stateFor(tag)

	// createNewRows: native had no list, so this batch *is* the list.
	if (!state.rows) {
		state.rows = rows.slice()
		// Trusted if we watched native's list get emptied first — otherwise only if the batch has
		// the shape of a whole list: every row an insert, at contiguous indices from zero. A
		// delta that adds one message is `[{index: 41, changeType: 1}]` and fails that test.
		if (!state.trusted) state.trusted = looksLikeFullSync(rows)
		return
	}

	const list = state.rows

	for (const row of rows) {
		if (isInsert(row)) list.splice(row.index, 0, row)
	}

	const rest = rows.filter(row => isDelete(row) || row?.changeType === ChangeType.UPDATE).reverse()

	for (const row of rest) {
		if (isDelete(row)) {
			list.splice(row.index, 1)
			continue
		}

		// `LOAD_MORE_AFTER` landing at index 0 while a spinner is still the head row: native
		// inserts below it and drops the spinner, rather than overwriting in place.
		const replacingSpinner =
			isLoadingRow(row) &&
			row.index === 0 &&
			row.button?.action?.type === "LOAD_MORE_AFTER" &&
			isLoadingRow(list[0]) &&
			list[0]?.isLoading === true

		if (replacingSpinner) {
			list.splice(1, 0, row)
			list.splice(0, 1)
		} else {
			list[row.index] = row
		}
	}
}

export function noteCleared(tag: number) {
	const state = stateFor(tag)
	state.rows = undefined
	// We watched native empty this list, so whatever arrives next is genuinely the whole thing.
	state.trusted = true
}

function chatManager(): any {
	try {
		return (revenge.react.ReactNative as any)?.NativeModules?.DCDChatManager
	} catch {
		return undefined
	}
}

/**
 * Repaints every chat list we have a mirror for.
 *
 * @returns a short description of what it managed to do, for the settings page — or undefined
 * when there is nothing to repaint, which is the normal answer if no channel has been opened
 * since the plugin started.
 */
export function refreshChat(): string | undefined {
	// The DM header, member list and profile sheets are ordinary React components subscribed to
	// stores, so an emit is exactly the right tool for them — it just never was for the message
	// list. Done first and unconditionally: it is independent of whether any chat is mirrored.
	const nudged = nudgeStores()

	// On builds where the native chat module is unreachable (this one), asking Discord to
	// regenerate the open channel's rows through its own pipeline is the only repaint path.
	// Each cached message gets a MESSAGE_UPDATE dispatch; MessageStore re-emits and the row
	// regenerates through RowManager.generate (our hook redacts or restores it per toggle).
	const fluxOutcome = rerenderViaFlux()

	const manager = chatManager()
	if (typeof manager?.updateRows !== "function" || typeof manager?.clearRows !== "function") {
		const outcome = `DCDChatManager unavailable; ${fluxOutcome}`
		noteRefreshOutcome(outcome)
		return outcome
	}

	const enabled = isEnabled()
	const { style, redactAvatars, redactBadges, redactSelf } = settings()

	let repainted = 0
	let untrusted = 0

	for (const [tag, state] of tags) {
		const mirror = state.rows
		if (!mirror || mirror.length === 0) continue

		// Repainting from a partial mirror would replace a whole conversation with the fragment
		// of it we happened to see. Better to leave the screen alone and say so.
		if (!state.trusted) {
			untrusted++
			continue
		}

		try {
			// A deep copy: `redactRows` rewrites in place, and the mirror has to keep holding the
			// real names so that toggling back off can restore them.
			const payload: any[] = JSON.parse(JSON.stringify(mirror))

			// createNewRows forbids deletes and takes the list as given, so every row goes over as
			// an insert at its own ordinal.
			payload.forEach((row, index) => {
				row.index = index
				row.changeType = ChangeType.INSERT
			})

			if (enabled) {
				redactRows(payload, {
					style,
					avatars: redactAvatars,
					badges: redactBadges,
					self: redactSelf,
					selfId: currentUserId(),
				})
			}

			replaying = true
			try {
				manager.clearRows(tag)
				manager.updateRows(tag, JSON.stringify(payload), false)
			} finally {
				replaying = false
			}

			// The replay ran with the hook standing down, so put the mirror back by hand. Native
			// now holds `payload`; we go on holding the unredacted original.
			state.rows = mirror
			repainted++
		} catch (error) {
			console.error("[ScreenshotRedactor] repaint failed for tag", tag, error)
			noteRefreshOutcome(`failed: ${String(error)}`)
			return undefined
		}
	}

	const nudgeNote = nudged.length ? `, nudged ${nudged.length} stores` : ", no store nudged"

	if (repainted === 0) {
		const outcome =
			(untrusted > 0
				? `${untrusted} list${untrusted === 1 ? "" : "s"} mirrored only partially`
				: "nothing mirrored yet") + `${nudgeNote}; ${fluxOutcome}`
		noteRefreshOutcome(outcome)
		return outcome
	}

	count("repaints")
	const outcome = `repainted ${repainted} chat list${repainted === 1 ? "" : "s"}${nudgeNote}; ${fluxOutcome}`
	noteRefreshOutcome(outcome)
	return outcome
}

/** @returns how many rows are currently mirrored, for Diagnostics. */
export function mirroredRowCount(): number {
	let total = 0
	for (const state of tags.values()) total += state.rows?.length ?? 0
	return total
}

export function mirroredTagCount(): number {
	return tags.size
}

export function resetChatRows() {
	tags.clear()
	replaying = false
}
