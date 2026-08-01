import { DEFAULTS } from "../defaults"
import { findInReactTree } from "../lib/findInReactTree"
import { noteInjectOutcome, noteSheetKey, noteSheetPatch, noteSheetType } from "../lib/diagnostics"
import { refreshChat } from "../lib/chatRows"
import { RELOAD_NOTICE } from "../lib/notices"
import { getStorage, onEnabledChanged, settings } from "../lib/state"

/**
 * The quick toggle, as a row in the message long-press sheet.
 *
 * This replaced a floating button over the chat. The floating button worked, but a control whose
 * entire purpose is "make this screenshot safe to post" is a bad thing to have permanently
 * parked in the corner of the shot — the 8-second self-hide was a workaround for a placement
 * that was wrong to begin with. A long-press sheet is invisible until asked for, so it cannot
 * end up in a screenshot at all, and it closes itself on tap.
 *
 * ## Why this hooks `openLazy` rather than the sheet module
 *
 * 0.5.0 looked the sheet up by module name and found nothing — all three guesses
 * (`MessageLongPressActionSheet`, `MessageActionSheet`, `MessageLongPressSheet`) missed. Only
 * the *channel* and *forum* sheet names are actually known in this repo, from Jump To Top, and
 * a fourth guess is a bad bet.
 *
 * Every action sheet in the app is opened through
 * `ActionSheetActionCreators.openLazy(sheetPromise, key, props)` — a typed, confirmed API — and
 * the `key` names the sheet. Hooking that finds the message sheet without knowing its module
 * name, and records every key it sees, so if the match below is still wrong the Diagnostics row
 * now simply *tells you* the real name after one long-press.
 *
 * Deliberately not the channel or forum sheets: Jump To Top owns those, and stacking two
 * plugins' rows into one sheet is how you end up debugging someone else's insertion order.
 */

const SYM_PATCHED = Symbol.for("Patched by ScreenshotRedactor")

/**
 * Which sheet key counts as "the message one".
 *
 * Loose on purpose — the exact string is unknown, and the cost of a false positive is a
 * "Hide names" row appearing in one sheet too many, while the cost of a false negative is the
 * feature not existing. Channel, forum and guild sheets are excluded because they belong to
 * Jump To Top.
 */
function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

/**
 * A component's name, however it is wrapped.
 *
 * `type.name` alone is what Jump To Top matches on, and it is not enough here: a
 * `React.memo()`-wrapped component has no `.name` of its own — the wrapper is a plain
 * `{ $$typeof, type, compare }` object — so the name lives on `type.type.name` instead. This is
 * the same trap that forced staff-tags to hand-build a filter for `UserRow`; see
 * docs/porting-rules.md rule 3. `forwardRef` hides it under `render` for the same reason.
 */
function typeNameOf(node: any): string | undefined {
	const t = node?.type
	if (!t) return undefined
	return t.name || t.displayName || t.type?.name || t.type?.displayName || t.render?.name || undefined
}

const isRowGroup = (node: any) => /ActionSheetRowGroup$/.test(typeNameOf(node) ?? "")

/**
 * Finds the element that *contains* the row groups, so a new group can be added beside them.
 *
 * Jump To Top looks for an array of groups, because the channel sheet has several. The message
 * sheet does not: confirmed on device, it nests single children —
 * `AnalyticsLocationProvider` → `ActionSheetRowGroup` → `ActionSheetRow` — so `props.children`
 * is a lone object and there is no array to insert into anywhere in the tree. Matching the
 * *parent* works for both shapes.
 */
function findGroupParent(tree: any) {
	return findInReactTree(tree, node => {
		const children = node?.props?.children
		if (!children) return false
		return Array.isArray(children) ? children.some(isRowGroup) : isRowGroup(children)
	})
}

/** Records every component name in a rendered sheet, so a failed match can be diagnosed. */
function recordSheetTypes(tree: any) {
	findInReactTree(tree, node => {
		noteSheetType(typeNameOf(node))
		return false
	})
}

/**
 * Prints the sheet's actual shape to the console, which reaches `adb logcat` under the
 * `ReactNativeJS` tag.
 *
 * The Diagnostics string in settings carries roughly one fact per release, which is a poor rate
 * to debug a tree structure at — "no row-group array" cost a round on its own, when what was
 * needed was to see that the sheet nests single children rather than arraying them. This prints
 * the whole thing at once. Names and structure only; no props are logged, since a sheet's props
 * hold the message.
 */
function dumpSheetTree(tree: any, depth = 0, lines: string[] = []): string[] {
	if (depth > 12 || lines.length > 120) return lines

	if (Array.isArray(tree)) {
		lines.push(`${"  ".repeat(depth)}[array ${tree.length}]`)
		for (const entry of tree) dumpSheetTree(entry, depth + 1, lines)
		return lines
	}

	if (!tree || typeof tree !== "object") return lines

	const children = tree.props?.children
	const kind = Array.isArray(children) ? `array(${children.length})` : children ? "single" : "none"
	lines.push(`${"  ".repeat(depth)}${typeNameOf(tree) ?? "?"} children=${kind}`)

	if (Array.isArray(children)) {
		for (const child of children) dumpSheetTree(child, depth + 1, lines)
	} else if (children) {
		dumpSheetTree(children, depth + 1, lines)
	}

	return lines
}

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		// Looked up lazily, at the moment a sheet actually opens, rather than from start():
		// lookupModule permanently caches a miss, and this module is sheet UI that may not have
		// loaded yet on a cold launch. By the time a sheet is rendering, it has. See rule 3.
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		actionSheetRow = lookupModule<any>(withProps("ActionSheetRow"))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

function buildToggleRow() {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null

	const { getAssetIdByName } = revenge.assets
	const storage = getStorage()
	const enabled = !!settings().enabled

	const onPress = () => {
		const next = !enabled
		try {
			storage?.set({ enabled: next })
			onEnabledChanged(next)
			refreshChat()

			revenge.discord.actions.ToastActionCreators.open({
				key: "ScreenshotRedactorToast",
				// Shorter than the settings toast -- this one fires with the sheet closing and a
				// screenshot about to be taken -- but the caveat still has to be on this path.
				// See `lib/notices.ts` for why one sentence lives in one place.
				content: next ? "Names hidden." : `Names shown. ${RELOAD_NOTICE}`,
			})
		} catch (error) {
			console.error("[ScreenshotRedactor] sheet toggle failed:", error)
		}

		// Close the sheet so the screenshot can be taken immediately, and so the row's own label
		// isn't left showing a stale state.
		try {
			revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* most rows close the sheet themselves; not worth failing the toggle over */
		}
	}

	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label={enabled ? "Show names" : "Hide names"}
				subLabel={enabled ? "Turn redaction off" : "Redact names and avatars for a screenshot"}
				icon={<ActionSheetRow.Icon source={getAssetIdByName(enabled ? "EyeIcon" : "EyeSlashIcon")} />}
				onPress={onPress}
			/>
		</ActionSheetRow.Group>
	)
}

/**
 * Inserts the toggle group into a rendered sheet, in place.
 *
 * Reports *why* it failed rather than just failing: "the module was patched" and "a row is on
 * screen" are different claims, and 0.6.0 only ever reported the first, which read as success
 * while the row was invisible.
 *
 * @returns whether it landed.
 */
function inject(rendered: any): boolean {
	const row = buildToggleRow()
	if (!row) {
		// The ActionSheetRow component itself couldn't be resolved -- nothing to insert.
		noteInjectOutcome("failed: no ActionSheetRow component")
		return false
	}

	const parent = findGroupParent(rendered)
	if (parent) {
		const children = parent.props.children
		if (Array.isArray(children)) {
			children.unshift(row)
			noteInjectOutcome("inserted beside row groups")
		} else {
			// Single child: promote it to an array so the new group can sit alongside it.
			// Mutating a rendered element's props is how staff-tags adds its tag too -- React
			// only freezes props in development builds.
			parent.props.children = [row, children]
			noteInjectOutcome("inserted beside single row group")
		}
		console.log(`[ScreenshotRedactor] row inserted under ${typeNameOf(parent) ?? "?"}`)
		return true
	}

	// Fallback: no recognisable group anywhere, so aim for the sheet's own children instead.
	// Less precise -- the row may land in the wrong visual section -- but a row in an odd place
	// beats a feature that silently doesn't exist.
	const children = rendered?.props?.children
	if (Array.isArray(children)) {
		children.unshift(row)
		noteInjectOutcome("inserted into sheet children (fallback)")
		return true
	}
	if (children) {
		rendered.props.children = [row, children]
		noteInjectOutcome("inserted into sheet children, promoted (fallback)")
		return true
	}

	// Nothing worked. Record the tree's component names so the next round has something to aim
	// at instead of another guess.
	recordSheetTypes(rendered)
	noteInjectOutcome("failed: no row group and no children found")
	// Unconditional, not behind the debug switch: this only runs when the feature has already
	// failed, and it is the one thing that makes the next attempt something other than a guess.
	console.log("[ScreenshotRedactor] sheet tree:\n" + dumpSheetTree(rendered).join("\n"))
	return false
}

const patchedModules = new WeakSet<any>()

/**
 * Adds the row to a resolved sheet module.
 *
 * Preferred path is an `after` hook on the module's `default`, which is what Jump To Top does.
 * ESM namespace objects can be frozen, though, in which case the patcher can't write to them —
 * so the fallback returns a *copy* of the namespace whose default is a wrapper that calls the
 * original as a plain function and edits what comes back. That fallback only works for function
 * components, which is what sheets are.
 */
function patchSheetModule(mod: any, key: string, patches: Array<() => void>): any {
	if (!mod || typeof mod.default !== "function") return mod
	if (patchedModules.has(mod)) return mod

	try {
		patches.push(
			revenge.patcher.after(mod, "default", (rendered: any) => {
				try {
					if (rendered != null && !rendered[SYM_PATCHED] && inject(rendered)) {
						rendered[SYM_PATCHED] = true
					}
				} catch (error) {
					console.error("[ScreenshotRedactor] sheet injection failed:", error)
				}
				return rendered
			}),
		)

		patchedModules.add(mod)
		noteSheetPatch(key)
		return mod
	} catch {
		// Frozen namespace: hand back a copy instead of mutating theirs.
		try {
			const Original = mod.default
			const Wrapped = (props: any) => {
				const rendered = Original(props)
				try {
					if (rendered != null && !rendered[SYM_PATCHED] && inject(rendered)) {
						rendered[SYM_PATCHED] = true
					}
				} catch (error) {
					console.error("[ScreenshotRedactor] sheet injection failed:", error)
				}
				return rendered
			}

			noteSheetPatch(`${key} (copied)`)
			return { ...mod, default: Wrapped }
		} catch (error) {
			console.error("[ScreenshotRedactor] could not patch sheet module:", error)
			return mod
		}
	}
}

export default function patchMessageActionSheet(): () => void {
	const { ActionSheetActionCreators } = revenge.discord.actions
	const patches: Array<() => void> = []

	const enabled = () => (getStorage()?.cache as any)?.showSheetToggle ?? DEFAULTS.showSheetToggle

	patches.push(
		revenge.patcher.before(ActionSheetActionCreators as any, "openLazy", (args: any[]) => {
			try {
				const [sheet, key] = args
				// Recorded unconditionally, and before any matching: the whole point is that an
				// unrecognised sheet still tells us its name.
				noteSheetKey(key)

				if (
					enabled() &&
					typeof key === "string" &&
					isMessageSheet(key) &&
					sheet &&
					typeof sheet.then === "function"
				) {
					// A *derived* promise, not a `.then` bolted onto theirs: this way the sheet
					// component openLazy receives cannot resolve until after the row has been
					// added, so there is no race with their own resolution handler.
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, key, patches))
				}
			} catch (error) {
				console.error("[ScreenshotRedactor] openLazy hook failed:", error)
			}

			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook. Outside the try so it survives a throw above.
			return args
		}),
	)

	return () => {
		patches.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
