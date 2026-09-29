/**
 * The hold-and-swipe gesture's live state, shared between the touch handlers on the send button
 * (`patches/sendButton.tsx`) and the capsule drawn over it (`ui/components/SwipeIndicator.tsx`).
 *
 * `armed`/`past`/the button's place change a few times per gesture and re-render the capsule. The
 * finger's position changes every frame, so it goes into an `Animated.Value` instead and never
 * re-renders anything.
 */

/** How far up (dp) the finger has to go before letting go sends unchanged. */
export const SWIPE_DISTANCE = 88

/** How far the capsule stretches above the button, and so how far the knob can travel. */
export const SWIPE_TRAVEL = 120

/** The send button's place on screen (page coordinates), taken from the touch that went down on it. */
export type Anchor = { x: number; y: number; width: number; height: number }

type State = { armed: boolean; past: boolean; anchor?: Anchor }

let state: State = { armed: false, past: false }
const listeners = new Set<() => void>()
let drag: any

/** Created on first use: `revenge.react` must not be read at module scope (porting rule 1). */
export function swipeDrag(): any {
	drag ??= new revenge.react.ReactNative.Animated.Value(0)
	return drag
}

export function setSwipe(patch: Partial<State>) {
	const next = { ...state, ...patch }
	if (next.armed === state.armed && next.past === state.past && next.anchor === state.anchor) return
	state = next
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the gesture */
		}
	}
}

/** Where the finger is: how far up (dp) from where it went down, clamped to the capsule. */
export function setSwipeDistance(up: number) {
	swipeDrag().setValue(Math.max(0, Math.min(SWIPE_TRAVEL, up)))
}

/** The gesture state, re-rendering whenever it changes. Call like a hook. */
export function useSwipeState(): State {
	const React = revenge.react.React
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(redraw)
		return () => {
			listeners.delete(redraw)
		}
	}, [])
	return state
}
