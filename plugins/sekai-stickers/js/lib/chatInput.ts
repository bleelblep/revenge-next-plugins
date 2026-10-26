/**
 * The chat box's handle, so Add to message can put you back in the text field.
 *
 * In 349.5's `modules/chat_input/native/ChatInput.tsx`, `handleToggleKeyboard({ keyboardType:
 * SYSTEM })` -- what the picker's own "back to keyboard" does -- ends in
 * `this.chatInput.current.openSystemKeyboard()`. That same handle is the `chatInputRef` the chat
 * input passes to its children (Send Tweaks reads `getText()` from it), so ChatInput's render
 * (forwardRef up to 349, the memo's own function from 350.2) is wrapped to remember the latest one. Only one chat box is on screen at
 * a time; the newest render wins.
 */

import { wrapRender } from '../../../../shared/wrapRender'
import * as finders from '@revenge-mod/discord/utils/modules/finders'
import { reportError } from '../../../../shared/report'

const PATH = 'modules/chat_input/native/ChatInput.tsx'

type Ref = { current?: { openSystemKeyboard?: () => void; focus?: () => void } | null }

let latest: Ref | undefined

function findRef(node: any, depth = 0): Ref | undefined {
	if (!node || typeof node !== 'object' || depth > 12) return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findRef(child, depth + 1)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.chatInputRef
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findRef(node.props?.children, depth + 1)
}

export function patchChatInput(): () => void {
	let undo: (() => void) | undefined
	let active = true
	const unsubscribe = (finders as any).getModuleWithImportedPath(PATH, (exports: any) => {
		if (!active || undo) return
		// memo(forwardRef) up to 349, memo(function) from 350.2: wrapRender handles both.
		undo = wrapRender(exports, original => function (this: unknown, ...args: any[]) {
			const tree = Reflect.apply(original, this, args)
			if (active) {
				try {
					latest = findRef(tree) ?? latest
				} catch {
					/* keep the last one */
				}
			}
			return tree
		})
		if (!undo) reportError('[Sekai Stickers] could not wrap the chat input: unknown component shape')
	})
	return () => {
		active = false
		unsubscribe?.()
		undo?.()
		latest = undefined
	}
}

/** Back to the text field with the system keyboard, as the picker's own keyboard button does. */
export function backToTextField(): boolean {
	const input = latest?.current
	try {
		if (typeof input?.openSystemKeyboard === 'function') {
			input.openSystemKeyboard()
			return true
		}
		if (typeof input?.focus === 'function') {
			input.focus()
			return true
		}
	} catch (error) {
		reportError('[Sekai Stickers] back to text field failed:', error)
	}
	return false
}
