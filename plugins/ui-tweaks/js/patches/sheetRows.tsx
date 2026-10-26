/**
 * Hides rows, whole sections, and the emoji row of the message long-press sheet.
 *
 * The sheet opens through `ActionSheetActionCreators.openLazy(promise, 'MessageLongPressActionSheet',
 * props)`; the promise resolves to a module whose `default` renders (verified live on 350.4):
 *
 *     AnalyticsLocationProvider
 *       ActionSheet  header=<EmojiRow message channel />
 *         ActionSheetRowGroup        <- a section; 3 on 350.4 (actions / tools / Report-Delete)
 *           ActionSheetRow label="Reply" icon onPress …
 *
 * Rows are matched by their `label` string, which is what the user sees. Sections are matched by
 * the rows they hold (lib/layout.ts `sectionIndexFor`); 0.2.x-0.3.1 matched them by position,
 * which hit the wrong section on messages missing the top one. 0.1.x matched icons
 * through `getAssetByName`, which returns an asset entry, never the icon component, so nothing ever
 * matched and nothing was hidden.
 *
 * Plugins add their own rows and sections with their own hooks on the same module, and hook
 * order isn't fixed, so the module hook only *marks* the ActionSheet element; the hiding happens
 * in a wrapper around Design.ActionSheet's render, which runs after every plugin has added its
 * rows. When ActionSheet can't be wrapped, the module hook prunes directly (plugin rows added
 * after it then stay). Plugin rows are told apart by their icon: Discord's rows pass an
 * `IconComponent`, plugins pass an asset `source`. A section of only plugin rows is a plugin
 * section, keyed by the plugin's name where lib/layout.ts knows its rows (labels change per person
 * and state), else `plugin:<first row>`.
 *
 * 0.3.0 extended this to every long-press menu; that broke hiding on device and was rolled back
 * in 0.3.1 to this message-only version.
 *
 * The derived promise patches the module once (a WeakSet; 0.1.x stacked another `after` hook on
 * every open). Children are replaced in place on the rendered elements -- mutating a rendered
 * element's props is how staff-tags adds its tag too; React only freezes props in development.
 */

import { wrapRender } from '../../../../shared/wrapRender'
import { pluginSectionKey, recordSheet, rowKey, sectionIndexFor, sheetGroupHidden, sheetLayout, sheetRowHidden } from '../lib/layout'
import { settings } from '../lib/state'
import * as actions from '@revenge-mod/discord/actions'
import * as design from '@revenge-mod/discord/design'
import { after, before } from '@revenge-mod/patcher'
import { reportError } from '../../../../shared/report'

const DEBUG: boolean = false

const TAG = '[UITweaks]'
const SHEET_KEY = 'MessageLongPressActionSheet'

function flat(children: any): any[] {
	if (children == null || children === false) return []
	if (Array.isArray(children)) return children.flatMap(flat)
	return [children]
}

/** The ActionSheet element: the first one carrying a `header` prop or the Design component. */
function findActionSheet(node: any, depth = 0): any {
	if (!node || typeof node !== 'object' || depth > 6) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const found = findActionSheet(child, depth + 1)
			if (found) return found
		}
		return undefined
	}
	const { ActionSheet } = design.Design as any
	if (node.props && (node.type === ActionSheet || 'header' in node.props)) return node
	return findActionSheet(node.props?.children, depth + 1)
}

function isRow(node: any): boolean {
	return !!node?.props && typeof node.props.label === 'string' && typeof node.props.onPress === 'function'
}

/** A row a plugin added: Discord's own rows carry an `IconComponent`, plugins' an asset `source`. */
function isPluginRow(row: any): boolean {
	return !row.props.icon?.props?.IconComponent
}

/** Marks the message sheet's ActionSheet element for the ActionSheet wrapper. */
const MARK = '__uiTweaksMessageSheet'
let wrapped = false

/** Hides rows and sections in [sheetProps] (an ActionSheet's props), in place. */
function prune(sheetProps: any) {
	// Sections are the children that hold rows; anything else (spacers, banners) is left alone.
	const children = flat(sheetProps.children)
	const groups = children.filter(child => flat(child?.props?.children).some(isRow))
	const rowsOf = (group: any) => flat(group.props.children).filter(isRow)
	const pluginOnly = (group: any) => rowsOf(group).every(isPluginRow)
	const saved = sheetLayout()
	const keys = new Map<any, string>()
	const pluginKey = (group: any) => keys.get(group) ?? ''

	const sections: string[][] = []
	const plugins: Record<string, string[]> = {}
	for (const group of groups) {
		const labels = rowsOf(group).map((row: any) => rowKey(row.props.label))
		if (pluginOnly(group)) {
			const key = pluginSectionKey(labels, saved)
			keys.set(group, key)
			plugins[key] = [...(plugins[key] ?? []), ...labels.filter(label => !plugins[key]?.includes(label))]
		} else sections.push(labels)
	}
	const layout = recordSheet(sections, plugins)

	if (settings().hideSheetEmojiRow) sheetProps.header = null

	sheetProps.children = children.filter(child => {
		if (!groups.includes(child)) return true
		// Discord's sections by their rows (see lib/layout.ts), not their position on screen.
		const id = pluginOnly(child)
			? pluginKey(child)
			: sectionIndexFor(layout, rowsOf(child).map((row: any) => rowKey(row.props.label))) + 1
		if (id !== 0 && sheetGroupHidden(id)) return false
		const rows = flat(child.props.children)
		const kept = rows.filter(row => !isRow(row) || !sheetRowHidden(rowKey(row.props.label)))
		if (kept.length !== rows.length) child.props.children = kept
		// A section left with no rows goes too, rather than an empty gap.
		return kept.some(isRow)
	})
}

/** Wraps Design.ActionSheet so marked (message) sheets are pruned at render time. */
function wrapActionSheet(): (() => void) | undefined {
	const Design = design.Design as any
	const restore = wrapRender(Design.ActionSheet, original => function (this: unknown, ...args: any[]) {
		const props = args[0]
		if (!props?.[MARK]) return Reflect.apply(original, this, args)
		const { [MARK]: _mark, ...rest } = props
		try {
			prune(rest)
		} catch (error) {
			reportError(`${TAG} long-press sheet failed:`, error)
		}
		return Reflect.apply(original, this, [rest, ...args.slice(1)])
	})
	if (!restore) { if (DEBUG) console.warn(`${TAG} ActionSheet can't be wrapped; plugin rows added late won't be hidden`) }
	return restore
}

const patched = new WeakSet<any>()

function patchSheetModule(mod: any, patches: Array<() => void>): any {
	if (!mod || typeof mod.default !== 'function' || patched.has(mod)) return mod
	patched.add(mod)
	patches.push(
		after(mod, 'default', (rendered: any) => {
			try {
				const sheet = rendered != null ? findActionSheet(rendered) : undefined
				if (!sheet) { if (DEBUG) console.warn(`${TAG} long-press sheet: no ActionSheet in the render`) }
				else if (wrapped) sheet.props[MARK] = true
				else prune(sheet.props)
			} catch (error) {
				reportError(`${TAG} long-press sheet failed:`, error)
			}
			return rendered
		}),
	)
	return mod
}

export default (): (() => void) => {
	const { ActionSheetActionCreators } = actions
	const patches: Array<() => void> = []

	const restoreSheet = wrapActionSheet()
	wrapped = !!restoreSheet
	if (restoreSheet) {
		patches.push(() => {
			restoreSheet()
			wrapped = false
		})
	}

	patches.push(
		before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key] = args
				if (key === SHEET_KEY && sheet && typeof sheet.then === 'function') {
					// A *derived* promise, not a `.then` bolted onto theirs (see pronouns/screenshot-redactor).
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			// A before-hook must return the args array (porting rule 2).
			return args
		}),
	)

	return () => {
		for (const unpatch of patches.splice(0)) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
