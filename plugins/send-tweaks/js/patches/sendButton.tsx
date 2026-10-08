/**
 * Hold the send button and swipe up to preview the message or send it unchanged.
 *
 * ## Where the button is (Discord 348, checked live over devtools)
 *
 * `ChatInputSendButton` (`modules/chat_input/native/accessories/`) renders a transition group whose
 * item is a memo that finally draws `ChatInputActionButton`
 * (`modules/chat_input/native/action_buttons/ChatInputActionButton.tsx`, a `memo(forwardRef(...))`
 * up to 349, a plain `memo(...)` from 350.2 alpha; `lib/wrapRender.ts` handles both).
 * That same component draws the chat bar's other round buttons too. Its render returns a pressable
 * with `onPress` and `disabled`, holding the icon it was given. The send button is the one whose
 * icon is the `SendMessageIcon` export resolved by imported path. Discord 349.5 strips its function
 * name; neither that name nor the translated accessibility label ("Send") can identify it.
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
 * `onTouchStart` never arrives and the swipe can't be followed; the long-press then opens the
 * preview straight away instead of doing nothing.
 *
 * ## Tap to preview
 *
 * Not everyone can hold and slide (testers reported the hold never registering, and some people
 * just can't do the gesture). With "Tap send to preview" on, a plain tap opens the preview, and its
 * Send button calls Discord's own `onPress`. An empty or unreadable draft (attachments only, the
 * composer not found yet) and slash commands send normally, so a tap never gets stuck.
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

import { composerContext, readComposer } from '../lib/composer'
import { sendOnce } from '../lib/nextSend'
import { showPreview } from '../lib/preview'
import { settings, TAG } from '../lib/state'
import { type Stop, type SwipeActions, setSwipe, setSwipeDistance, stopAt } from '../lib/swipe'
import { wrapRender } from '../lib/wrapRender'
import SwipeIndicator from '../ui/components/SwipeIndicator'

const PATH = 'modules/chat_input/native/action_buttons/ChatInputActionButton.tsx'
const ICON_PATH = 'design/components/Icon/native/redesign/generated/SendMessageIcon.tsx'

const status = { installed: false, moduleId: -1, swiped: 0, previewed: 0, tapped: 0, fallbacks: 0, touchesSeen: false }

export function sendButtonStatus() {
	return { ...status }
}

/** The touch in progress on the send button. One finger, one button: module state is enough. */
const gesture = { touched: false, armed: false, stop: 0 as Stop, startY: 0 }

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

function swipeProps(element: any, send: unknown, actions: SwipeActions, getDraft: () => string | undefined) {
	const sendFn = typeof send === 'function' ? (send as () => void) : undefined
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
			// The pressable dropped the touch props, so the swipe can't be followed: the hold alone
			// previews instead (or sends unchanged, when that is the only action).
			if (!gesture.touched) {
				status.fallbacks++
				buzz(10)
				if (actions.preview) {
					if (showPreview(getDraft(), sendFn)) status.previewed++
				} else if (actions.send) {
					status.swiped++
					sendOnce('raw', sendFn)
				}
				return
			}
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
				if (showPreview(getDraft(), sendFn)) status.previewed++
			} else if (stop === 2) {
				status.swiped++
				sendOnce('raw', sendFn)
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

/**
 * Tap send to preview: the tap opens the preview instead of sending. Anything there is nothing to
 * preview for (empty or unreadable draft, a slash command) goes straight to Discord's own `onPress`.
 */
function tapProps(send: unknown, getDraft: () => string | undefined) {
	return {
		onPress: (...args: unknown[]) => {
			const sendFn = typeof send === 'function' ? (send as (...a: unknown[]) => void) : undefined
			const draft = getDraft()
			if (draft === undefined || !draft.trim() || draft.trimStart().startsWith('/')) {
				sendFn?.(...args)
				return
			}
			try {
				if (showPreview(draft, sendFn && (() => sendFn(...args)))) {
					status.tapped++
					return
				}
			} catch (error) {
				console.error(`${TAG} tap preview failed, sending normally:`, error)
			}
			sendFn?.(...args)
		},
	}
}

/** A separate component keeps our context hook out of Discord's own hook chain. */
function SwipeButton({
	element,
	buttonProps,
	actions,
	tapPreview,
}: { element: any; buttonProps: any; actions: SwipeActions; tapPreview: boolean }) {
	const React = revenge.react.React
	const composer = React.useContext(composerContext())
	const getDraft = () => readComposer(composer)
	const swipe = actions.preview || actions.send
	return React.cloneElement(
		element,
		{
			...(swipe ? swipeProps(element, element.props.onPress, actions, getDraft) : null),
			...(tapPreview ? tapProps(element.props.onPress, getDraft) : null),
		},
		element.props.children,
		!swipe ? null : <SwipeIndicator
			key="send-tweaks-swipe"
			Icon={buttonProps?.IconComponent}
			actions={actions}
			buttonColour={buttonColour(element, buttonProps)}
			buttonRadius={buttonRadius(element)}
		/>,
	)
}

export default function patchSendButton(): () => void {
	let undo: (() => void) | undefined
	let sendIcon: any

	const install = (exports: any, id: number) => {
		if (undo) return
		let active = true
		const unwrap = wrapRender(exports, original => function (this: unknown, props: any, ref: unknown) {
			const element = original.call(this, props, ref)
			const s = settings()
			const actions = { preview: !!s.swipePreview, send: !!s.swipeSendUnchanged }
			const tapPreview = !!s.tapToPreview
			if (!active || (!actions.preview && !actions.send && !tapPreview)) return element
			try {
				const icon = props?.IconComponent ?? element?.props?.children?.type
				if (!sendIcon || icon !== sendIcon || !element?.props) return element
				return <SwipeButton element={element} buttonProps={props} actions={actions} tapPreview={tapPreview} />
			} catch (error) {
				console.error(`${TAG} send button long-press failed:`, error)
				return element
			}
		})
		if (!unwrap) {
			console.error(`${TAG} could not wrap the send button: module ${id} is neither memo(forwardRef) nor memo(function)`)
			return
		}

		status.installed = true
		status.moduleId = id
		console.log(`${TAG} send button long-press on module ${id}`)
		undo = () => {
			active = false
			unwrap()
		}
	}

	let unsubscribe: (() => void) | undefined
	let unsubscribeIcon: (() => void) | undefined
	try {
		unsubscribeIcon = revenge.discord.utils.modules.finders.getModuleWithImportedPath(
			ICON_PATH,
			(exports: any) => {
				sendIcon = exports?.SendMessageIcon
			},
		)
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
		unsubscribeIcon?.()
		undo?.()
		sendIcon = undefined
		undo = undefined
	}
}
