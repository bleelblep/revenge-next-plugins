/**
 * Long-press the send button for the Send Tweaks sheet (`ui/components/SendSheet.tsx`), or hold and
 * swipe up to send unchanged.
 *
 * ## Where the button is (Discord 348, checked live over devtools)
 *
 * `ChatInputSendButton` (`modules/chat_input/native/accessories/`) renders a transition group whose
 * item is a memo that finally draws `ChatInputActionButton`
 * (`modules/chat_input/native/action_buttons/ChatInputActionButton.tsx`, a `memo(forwardRef(...))`).
 * That same component draws the chat bar's other round buttons too. Its render returns a pressable
 * with `onPress` and `disabled`, holding the icon it was given. The send button is the one whose
 * icon is `SendMessageIcon`; the accessibility label ("Send") is translated, so it is not used.
 *
 * `ChatInputActionButton` takes no `onLongPress` and drops unknown props, so the prop is added to
 * the pressable it returns. The pressable honours it, and a long-press does not also send.
 *
 * ## Hold and swipe
 *
 * In swipe mode the long-press only arms the gesture; the finger's raw touch events (`onTouchMove`,
 * `onTouchEnd`, which go to the view the touch started on wherever the finger goes) decide the rest.
 * While armed, `ui/components/SwipeIndicator.tsx` draws a slide track above the button whose knob
 * follows the finger. Letting go at least [SWIPE_DISTANCE] above where the finger went down sends unchanged; letting go
 * anywhere else cancels. The sheet is off entirely in this mode. The long-press is what keeps this from also sending normally: once
 * it fires, the pressable never calls `onPress` for that touch. A quick swipe with no hold never
 * arms and never sends, because the finger leaves the button before the press could count.
 *
 * The pressable passes the touch props on to its view (checked live on 348.5). If it ever stops,
 * `onTouchStart` never arrives and the long-press does nothing.
 *
 * ## A plain wrapper on `render`
 *
 * Same reasoning as `lib/wrap.ts`: a plain function cannot join the patcher's two-`instead`
 * recursion, whatever else hooks this component. It only adds props to the send button's output;
 * every other button, and the send button's tap, are untouched.
 *
 * While the button is disabled (nothing typed yet) the pressable ignores presses, so none of this
 * happens until there is something to send.
 */

import { sendOnce } from '../lib/nextSend'
import { settings, TAG } from '../lib/state'
import { SWIPE_DISTANCE, setSwipe, setSwipeDistance } from '../lib/swipe'
import SendSheet, { SHEET_KEY, sheetHasContent } from '../ui/components/SendSheet'
import SwipeIndicator from '../ui/components/SwipeIndicator'

const PATH = 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'

const status = { installed: false, moduleId: -1, opened: 0, swiped: 0, touchesSeen: false }

export function sendButtonStatus() {
	return { ...status }
}

/** The touch in progress on the send button. One finger, one button: module state is enough. */
const gesture = { touched: false, armed: false, past: false, startY: 0 }

const nameOf = (type: any): string | undefined =>
	type?.name || type?.displayName || type?.type?.name || type?.render?.name

function openSheet(send: unknown) {
	const canSend = typeof send === 'function'
	if (!sheetHasContent(settings(), canSend)) return
	status.opened++
	revenge.discord.actions.ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: SendSheet }),
		SHEET_KEY,
		{ send: canSend ? () => (send as () => void)() : undefined },
	)
}

function buzz(ms: number) {
	try {
		revenge.react.ReactNative.Vibration.vibrate(ms)
	} catch {
		/* no vibration is fine */
	}
}

/**
 * Where the button is on screen, for the capsule drawn over it. `currentTarget` is the pressable's
 * own view (the touch's `target` may be the icon inside it), so measuring it gives the whole button.
 * Falls back to a 40dp square around the finger if the view can't be measured.
 */
function anchorFrom(event: any) {
	const n = event?.nativeEvent
	const guess = () =>
		setSwipe({ anchor: { x: (n?.pageX ?? 0) - 20, y: (n?.pageY ?? 0) - 20, width: 40, height: 40 } })
	const view = event?.currentTarget
	if (typeof view?.measureInWindow !== 'function') {
		guess()
		return
	}
	try {
		view.measureInWindow((x: number, y: number, width: number, height: number) => {
			if (width > 0 && height > 0) setSwipe({ anchor: { x, y, width, height } })
			else guess()
		})
	} catch {
		guess()
	}
}

/** Calls the pressable's own handler for [name], if it had one, before ours. */
function chain(element: any, name: string, ours: (event: any) => void) {
	const theirs = element.props[name]
	return (event: any) => {
		if (typeof theirs === 'function') theirs(event)
		try {
			ours(event)
		} catch (error) {
			console.error(`${TAG} send button ${name} failed:`, error)
		}
	}
}

function swipeProps(element: any, send: unknown) {
	const pageY = (event: any): number => event?.nativeEvent?.pageY ?? gesture.startY
	const end = () => {
		gesture.touched = false
		gesture.armed = false
		gesture.past = false
		setSwipe({ armed: false, past: false })
		setSwipeDistance(0)
	}
	return {
		delayLongPress: 250,
		onLongPress: () => {
			// The pressable dropped the touch props, so the swipe can't be seen. Hold-and-swipe has no
			// menu, so there is nothing to fall back to.
			if (!gesture.touched) return
			gesture.armed = true
			gesture.past = false
			setSwipeDistance(0)
			setSwipe({ armed: true, past: false })
			buzz(10)
		},
		onTouchStart: chain(element, 'onTouchStart', event => {
			gesture.touched = true
			gesture.armed = false
			gesture.past = false
			gesture.startY = pageY(event)
			status.touchesSeen = true
			anchorFrom(event)
		}),
		onTouchMove: chain(element, 'onTouchMove', event => {
			if (!gesture.armed) return
			const up = gesture.startY - pageY(event)
			setSwipeDistance(up)
			const past = up >= SWIPE_DISTANCE
			if (past === gesture.past) return
			gesture.past = past
			setSwipe({ past })
			if (past) buzz(20)
		}),
		onTouchEnd: chain(element, 'onTouchEnd', event => {
			const armed = gesture.armed
			const past = gesture.startY - pageY(event) >= SWIPE_DISTANCE
			end()
			if (!armed) return
			// Letting go short of the top cancels: in this mode the menu is off entirely.
			if (!past) return
			status.swiped++
			sendOnce('raw', typeof send === 'function' ? (send as () => void) : undefined)
		}),
		onTouchCancel: chain(element, 'onTouchCancel', () => end()),
	}
}

export default function patchSendButton(): () => void {
	let undo: (() => void) | undefined

	const install = (exports: any, id: number) => {
		const forwardRef = exports?.default?.type ?? exports?.type
		const original = forwardRef?.render
		if (typeof original !== 'function' || undo) return

		const React = revenge.react.React
		let active = true
		const wrapper = function (this: unknown, props: any, ref: unknown) {
			const element = original.call(this, props, ref)
			const s = settings()
			if (!active || !s.sendButtonSheet) return element
			try {
				const icon = nameOf(props?.IconComponent) ?? nameOf(element?.props?.children?.type)
				if (icon !== 'SendMessageIcon' || !element?.props) return element
				const send = element.props.onPress
				if (s.sendButtonMode === 'swipe') {
					return React.cloneElement(
						element,
						swipeProps(element, send),
						element.props.children,
						<SwipeIndicator key="send-tweaks-swipe" Icon={props?.IconComponent} />,
					)
				}
				return React.cloneElement(element, {
					onLongPress: () => openSheet(send),
					delayLongPress: 350,
				})
			} catch (error) {
				console.error(`${TAG} send button long-press failed:`, error)
				return element
			}
		}
		forwardRef.render = wrapper
		if (forwardRef.render !== wrapper) {
			console.error(`${TAG} could not wrap the send button`)
			return
		}

		status.installed = true
		status.moduleId = id
		console.log(`${TAG} send button long-press on module ${id}`)
		undo = () => {
			active = false
			if (forwardRef.render === wrapper) forwardRef.render = original
		}
	}

	let unsubscribe: (() => void) | undefined
	try {
		unsubscribe = revenge.discord.utils.modules.finders.getModuleWithImportedPath(
			PATH,
			(exports: any, id: number) => install(exports, id),
		)
	} catch (error) {
		console.error(`${TAG} could not look for the send button:`, error)
	}

	return () => {
		status.installed = false
		unsubscribe?.()
		undo?.()
		undo = undefined
		revenge.discord.actions.ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
	}
}
