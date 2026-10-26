/**
 * A fourth tab, "Sekai", in Discord's expression picker (emoji / GIFs / stickers), Discord 349.5.
 *
 * How the picker works (read from the Hermes bundle, modules/expression_picker/):
 *
 * - `ExpressionPickerConstants.tsx` exports `ExpressionPickerViewType` ({EMOJI:'emoji', GIF:'gif',
 *   STICKER:'sticker', SOUNDBOARD}) and `ExpressionPickerOrder`, the array ['emoji','gif','sticker'].
 * - `native/useExpressionPickerTabData.tsx` (default export) takes `{expressionType,
 *   expressionPickerTabs}` and returns `expressionPickerSelectedIndex`, `expressionPickerViewType`
 *   and `expressionPickerTabStrings`, the labels the segmented control shows.
 * - `native/ExpressionPicker.tsx` (default export, a memo) calls that hook, draws the segmented
 *   control, and below it a content view whose one child is the emoji, GIF or sticker picker for
 *   the current view type -- or null for any other. Tapping a tab calls
 *   `setKeyboardContext(KeyboardTypes.EXPRESSION, { expressionType: ExpressionPickerOrder[index] })`,
 *   which comes back down as the `expressionType` prop.
 *
 * So the tab takes three small patches: 'sekai' on the end of `ExpressionPickerOrder` (the same
 * array the picker reads, so tapping index 3 asks for 'sekai'), a "Sekai" label on the end of the
 * hook's tab strings (selected when `expressionType` is 'sekai'), and the picker's render filling
 * the empty content slot with our panel. Each is a plain property swap, undone on stop.
 *
 * The tab only appears when all three of Discord's own tabs do: the index-to-type mapping above
 * assumes the labels and `ExpressionPickerOrder` line up.
 */

import { getModuleByPath } from '../../../../shared/modules'
import * as React from 'react'
import { reportError } from '../../../../shared/report'

export const VIEW_TYPE = 'sekai'
const LABEL = 'Sekai'
const TAG = '[Sekai Stickers]'

const CONSTANTS = 'modules/expression_picker/ExpressionPickerConstants.tsx'
const TAB_DATA = 'modules/expression_picker/native/useExpressionPickerTabData.tsx'
const PICKER = 'modules/expression_picker/native/ExpressionPicker.tsx'

export const pickerStatus = { order: false, tabs: false, picker: false, rendered: 0 }

/** [Panel] is drawn in the picker's content area with `{ channel }`. */
export function patchPicker(Panel: (props: { channel: any }) => any): () => void {
	const undo: Array<() => void> = []
	let order: string[] | undefined

	undo.push(
		getModuleByPath(CONSTANTS, null, (mod: any) => {
			const list = mod?.ExpressionPickerOrder
			if (!Array.isArray(list)) throw new Error('ExpressionPickerOrder is not an array')
			order = list
			if (!list.includes(VIEW_TYPE)) list.push(VIEW_TYPE)
			const types = mod.ExpressionPickerViewType
			if (types && !types.SEKAI) types.SEKAI = VIEW_TYPE
			pickerStatus.order = true
			undo.push(() => {
				const at = list.indexOf(VIEW_TYPE)
				if (at >= 0) list.splice(at, 1)
				if (types?.SEKAI === VIEW_TYPE) delete types.SEKAI
			})
		}, TAG),
	)

	undo.push(
		getModuleByPath(TAB_DATA, null, (mod: any) => {
			const original = mod?.default
			if (typeof original !== 'function') throw new Error('useExpressionPickerTabData has no default')
			let lastIn: string[] | undefined
			let lastOut: string[] | undefined
			const wrapper = function (this: unknown, ...args: any[]) {
				const result = original.apply(this, args)
				try {
					const strings = result?.expressionPickerTabStrings
					// Only where the label lands on our type's index in the order: alongside all three of
					// Discord's tabs, and next to tabs other plugins add the same way (Pocket Browser).
					const index = order ? order.indexOf(VIEW_TYPE) : -1
					if (!Array.isArray(strings) || index < 0 || strings.length !== index) return result
					// Same array back while the labels don't change, so the segmented control's
					// own memo isn't broken every render.
					if (strings !== lastIn) {
						lastIn = strings
						lastOut = [...strings, LABEL]
					}
					const selected = args[0]?.expressionType === VIEW_TYPE
					return {
						...result,
						expressionPickerTabStrings: lastOut,
						...(selected
							? { expressionPickerSelectedIndex: index, expressionPickerViewType: VIEW_TYPE }
							: {}),
					}
				} catch (error) {
					reportError(`${TAG} tab data failed:`, error)
					return result
				}
			}
			mod.default = wrapper
			pickerStatus.tabs = true
			undo.push(() => {
				if (mod.default === wrapper) mod.default = original
			})
		}, TAG),
	)

	undo.push(
		getModuleByPath(PICKER, null, (mod: any) => {
			const memo = mod?.default
			const original = memo?.type
			if (typeof original !== 'function') throw new Error('ExpressionPicker is not a memo of a function')
			const wrapper = function (this: unknown, props: any, ref: unknown) {
				const tree = original.call(this, props, ref)
				if (props?.expressionType !== VIEW_TYPE) return tree
				try {
					// jsxs(View, { children: [segmented control, jsx(View, { style, children: picker }) ] })
					const children = tree?.props?.children
					const content = Array.isArray(children) ? children[children.length - 1] : undefined
					if (!content?.props || content.props.children != null) return tree
					pickerStatus.rendered++
					const filled = React.cloneElement(
						content,
						undefined,
						React.createElement(Panel, { key: 'sekai-stickers', channel: props.channel }),
					)
					return React.cloneElement(tree, undefined, ...children.slice(0, -1), filled)
				} catch (error) {
					reportError(`${TAG} picker content failed:`, error)
					return tree
				}
			}
			memo.type = wrapper
			pickerStatus.picker = true
			undo.push(() => {
				if (memo.type === wrapper) memo.type = original
			})
		}, TAG),
	)

	return () => {
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
	}
}
