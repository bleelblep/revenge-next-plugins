/**
 * Hold the send button and swipe up to preview the message or send it unchanged.
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
 * The long-press only arms the gesture; the finger's raw touch events (`onTouchMove`,
 * `onTouchEnd`, which go to the view the touch started on wherever the finger goes) decide the rest.
 * While armed, `ui/components/SwipeIndicator.tsx` draws a slide track above the button whose knob
 * follows the finger. With both swipe switches on the track has two stops: letting go halfway shows
 * a preview (`lib/preview.ts`), at the top sends unchanged, and anywhere lower cancels. With one on,
 * its stop is the top (`lib/swipe.ts`). The long-press is what keeps this from also sending normally: once
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
import { showPreview } from '../lib/preview'
import { settings, TAG } from '../lib/state'
import { type Stop, type SwipeActions, setSwipe, setSwipeDistance, stopAt } from '../lib/swipe'
import SwipeIndicator from '../ui/components/SwipeIndicator'

const PATH = 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'

const status = { installed: false, moduleId: -1, swiped: 0, previewed: 0, touchesSeen: false }

export function sendButtonStatus() {
	return { ...status }
}

/** The touch in progress on the send button. One finger, one button: module state is enough. */
const gesture = { touched: false, armed: false, stop: 0 as Stop, startY: 0 }

const nameOf = (type: any): string | undefined =>
	type?.name || type?.displayName || type?.type?.name || type?.render?.name

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

function swipeProps(element: any, send: unknown, actions: SwipeActions) {
	const pageY = (event: any): number => event?.nativeEvent?.pageY ?? gesture.startY
	const end = () => {
		gesture.touched = false
		gesture.armed = false
		gesture.stop = 0
		setSwipe({ armed: false, stop: 0 })
		setSwipeDistance(0)
	}
	return {
		delayLongPress: 250,
		onLongPress: () => {
			// The pressable dropped the touch props, so the swipe can't be seen: nothing to fall back to.
			if (!gesture.touched) return
			gesture.armed = true
			gesture.stop = 0
			setSwipeDistance(0)
			setSwipe({ armed: true, stop: 0 })
			buzz(10)
		},
		onTouchStart: chain(element, 'onTouchStart', event => {
			gesture.touched = true
			gesture.armed = false
			gesture.stop = 0
			gesture.startY = pageY(event)
			status.touchesSeen = true
			anchorFrom(event)
		}),
		onTouchMove: chain(element, 'onTouchMove', event => {
			if (!gesture.armed) return
			const up = gesture.startY - pageY(event)
			setSwipeDistance(up)
			const stop = stopAt(up, actions)
			if (stop === gesture.stop) return
			const higher = stop > gesture.stop
			gesture.stop = stop
			setSwipe({ stop })
			// A tick for each stop reached on the way up; nothing on the way back down.
			if (higher) buzz(stop === 2 ? 20 : 12)
		}),
		onTouchEnd: chain(element, 'onTouchEnd', event => {
			const armed = gesture.armed
			const stop = stopAt(gesture.startY - pageY(event), actions)
			end()
			if (!armed) return
			// Letting go below the first stop cancels.
			if (stop === 1) {
				status.previewed++
				showPreview(typeof send === 'function' ? (send as () => void) : undefined)
			} else if (stop === 2) {
				status.swiped++
				sendOnce('raw', typeof send === 'function' ? (send as () => void) : undefined)
			}
		}),
		onTouchCancel: chain(element, 'onTouchCancel', () => end()),
	}
}

/**
 * The send button's own fill, so the swipe capsule grows out of it in the same colour. Read off the
 * pressable's style (or a colour prop on the action button); undefined when neither carries one, and
 * the capsule then falls back to the theme's brand colour.
 */
/**
 * The send button's corner radius, so the capsule has the same corners: the first `borderRadius`
 * on the pressable or the views inside it (a few levels down; the icon is the innermost). Undefined
 * when none carries one, and the capsule uses its own guess.
 */
function buttonRadius(element: any): number | undefined {
	try {
		const { StyleSheet } = revenge.react.ReactNative
		let node = element
		for (let depth = 0; depth < 4 && node; depth++) {
			const style = typeof node.props?.style === 'function' ? node.props.style({ pressed: false }) : node.props?.style
			const radius = StyleSheet.flatten(style)?.borderRadius
			if (typeof radius === 'number' && radius >= 0) return radius
			const children = node.props?.children
			node = Array.isArray(children) ? children.find((c: any) => c?.props) : children
		}
	} catch {
		/* the capsule's own guess */
	}
	return undefined
}

function buttonColour(element: any, props: any): unknown {
	try {
		const { StyleSheet } = revenge.react.ReactNative
		const own = StyleSheet.flatten(element?.props?.style)?.backgroundColor
		if (own != null) return own
		const child = StyleSheet.flatten(element?.props?.children?.props?.style)?.backgroundColor
		if (child != null) return child
		return props?.backgroundColor ?? props?.color
	} catch {
		return undefined
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
			const actions = { preview: !!s.swipePreview, send: !!s.swipeSendUnchanged }
			if (!active || (!actions.preview && !actions.send)) return element
			try {
				const icon = nameOf(props?.IconComponent) ?? nameOf(element?.props?.children?.type)
				if (icon !== 'SendMessageIcon' || !element?.props) return element
				const send = element.props.onPress
				return React.cloneElement(
					element,
					swipeProps(element, send, actions),
					element.props.children,
					<SwipeIndicator
						key="send-tweaks-swipe"
						Icon={props?.IconComponent}
						actions={actions}
						buttonColour={buttonColour(element, props)}
						buttonRadius={buttonRadius(element)}
					/>,
				)
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
	}
}
