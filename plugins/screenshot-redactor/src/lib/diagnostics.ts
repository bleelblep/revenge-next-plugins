/**
 * Counters for working out *why* a surface isn't being redacted.
 *
 * "Works in chat but not DMs" has several possible causes that look identical from the outside:
 * DM rows might never reach the hook (a second RowManager we never patched), or reach it and be
 * skipped (an unexpected `rowType`, a missing author), or be redacted correctly and simply not
 * repainted (the virtualised list's row cache). These counters tell those apart at a glance.
 *
 * Plain module state, no `revenge.*`, so module scope is safe. Nothing here is persisted and
 * nothing here records an identity — only counts and row type numbers.
 */

export interface Diagnostics {
	rowManagersPatched: number
	rowsSeen: number
	rowsRedacted: number
	skippedDisabled: number
	skippedRowType: number
	/** `after` ran with no row stashed for it — a before/after pairing failure, not a real row. */
	skippedNoRow: number
	skippedNoMessage: number
	skippedNoAuthor: number
	skippedSelf: number
	/** Deepest the before/after stack has been. >1 proves `generate` re-enters itself. */
	maxDepth: number
	/**
	 * Every distinct `rowType` this hook has been handed, as text — non-numeric values included.
	 * Recording only numbers is what made "32 skipped (row type)" sit next to "Row types seen:
	 * 1" and read as a contradiction.
	 */
	rowTypes: Set<string>
	/**
	 * Rows skipped for their row type that nonetheless carried an author. These would be a real
	 * leak; a divider or date separator is not.
	 */
	skippedRowTypeWithAuthor: number
	/** Whichever avatar keys were actually found on a row, once known. */
	avatarKeysSeen: Set<string>
	/** Which display-name resolver candidates were found and patched. */
	namePatches: Set<string>
	/** Which component the floating toggle managed to mount itself into. */
	overlayHost: string | undefined
	/** Which message action sheet the quick toggle attached to. */
	sheetHost: string | undefined
	/**
	 * Every action-sheet key seen opening, whether or not we recognised it. This is the
	 * discovery mechanism: long-press a message and the sheet's real name appears here.
	 */
	sheetKeysSeen: Set<string>
	/**
	 * What happened the last time the toggle row tried to insert itself. Patching the sheet
	 * module and actually landing a row in it are different things, and 0.6.0 only reported the
	 * former — which read as success while the row was invisible.
	 */
	injectOutcome: string | undefined
	/** Component names seen inside a rendered sheet, for finding the real row-group container. */
	sheetTypesSeen: Set<string>
}

const counters: Diagnostics = {
	rowManagersPatched: 0,
	rowsSeen: 0,
	rowsRedacted: 0,
	skippedDisabled: 0,
	skippedRowType: 0,
	skippedNoRow: 0,
	skippedNoMessage: 0,
	skippedNoAuthor: 0,
	skippedSelf: 0,
	skippedRowTypeWithAuthor: 0,
	maxDepth: 0,
	rowTypes: new Set(),
	avatarKeysSeen: new Set(),
	namePatches: new Set(),
	overlayHost: undefined,
	sheetHost: undefined,
	sheetKeysSeen: new Set(),
	injectOutcome: undefined,
	sheetTypesSeen: new Set(),
}

export function diagnostics(): Diagnostics {
	return counters
}

export function countRowManager() {
	counters.rowManagersPatched++
}

type CountableKey = Exclude<
	keyof Diagnostics,
	| "rowTypes"
	| "avatarKeysSeen"
	| "namePatches"
	| "overlayHost"
	| "sheetHost"
	| "sheetKeysSeen"
	| "injectOutcome"
	| "sheetTypesSeen"
	| "maxDepth"
	| "skippedRowTypeWithAuthor"
>

export function count(key: CountableKey) {
	counters[key]++
}

export function noteSkippedRowTypeWithAuthor() {
	counters.skippedRowTypeWithAuthor++
}

export function noteDepth(depth: number) {
	if (depth > counters.maxDepth) counters.maxDepth = depth
}

export function noteNamePatch(label: string) {
	counters.namePatches.add(label)
}

export function noteOverlayHost(name: string) {
	counters.overlayHost = name
}

export function noteSheetPatch(name: string) {
	counters.sheetHost = name
}

export function noteInjectOutcome(outcome: string) {
	counters.injectOutcome = outcome
}

export function noteSheetType(name: unknown) {
	if (typeof name === "string" && name && counters.sheetTypesSeen.size < 40) {
		counters.sheetTypesSeen.add(name)
	}
}

export function noteSheetKey(key: unknown) {
	if (typeof key === "string" && key && counters.sheetKeysSeen.size < 30) {
		counters.sheetKeysSeen.add(key)
	}
}

export function noteRowType(rowType: unknown) {
	if (counters.rowTypes.size >= 20) return
	counters.rowTypes.add(typeof rowType === "number" ? String(rowType) : `${typeof rowType}:${String(rowType)}`)
}

export function noteAvatarKey(key: string) {
	counters.avatarKeysSeen.add(key)
}

export function resetDiagnostics() {
	counters.rowManagersPatched = 0
	counters.rowsSeen = 0
	counters.rowsRedacted = 0
	counters.skippedDisabled = 0
	counters.skippedRowType = 0
	counters.skippedNoRow = 0
	counters.skippedNoMessage = 0
	counters.skippedNoAuthor = 0
	counters.skippedSelf = 0
	counters.skippedRowTypeWithAuthor = 0
	counters.maxDepth = 0
	counters.rowTypes.clear()
	counters.avatarKeysSeen.clear()
	counters.sheetKeysSeen.clear()
	counters.sheetTypesSeen.clear()
	counters.injectOutcome = undefined
	// namePatches and overlayHost deliberately survive a reset: they record what the plugin
	// managed to hook at start, not per-surface activity, and re-reading them is the whole
	// point of the reset-then-reproduce loop.
}
