/**
 * The length feed: Discord's own `ChatInputCharCounter`
 * (`modules/chat_input/native/accessories/ChatInputCharCounter.tsx`, 348.5).
 *
 * On every change to the text, the chat input's `handleSelectionOrTextChange` calls
 * `chatInputCharCounter.current.onMessageLengthChanged(text.length)`. Discord's counter exposes that
 * method through `useImperativeHandle` and turns it into "how far over the limit"; over the limit it
 * draws a red `-N` inside the message box, under the text.
 *
 * The render is wrapped so Discord's ref goes through ours: when its handle arrives, its
 * `onMessageLengthChanged` is wrapped to pass the length on (`lib/length.ts`), then the handle is
 * handed back. So the count updates on every keystroke, with no polling. Discord's own drawing is
 * dropped: the square above the message box (`lib/badge.tsx`) shows the count, and turns red past
 * the limit, in one place. (0.1.0 drew the count in Discord's slot, a centred row under the text
 * that made the box taller.)
 *
 * A plain wrapper on the forwardRef object's `render` (up to 349) or the memo's own function (350.2,
 * where the ref arrives as `props.ref`), not a patcher `instead`: two `instead` hooks on one method
 * recurse (upstream bug).
 */

import { setLength } from './length'
import { wrapRender } from './wrapRender'

const PATH = 'modules/chat_input/native/accessories/ChatInputCharCounter.tsx'

export const counterStatus = { hooked: false, moduleId: -1, lastError: '' }

export function patchCounter(): () => void {
	return wrapRender(PATH, counterStatus, original =>
		function CharCounterFeed(props: any, legacyRef: any) {
			// Up to 349 the ref is forwardRef's second argument; from 350.2 (React 19, no forwardRef)
			// it is `props.ref`, and Discord's useImperativeHandle reads it from there.
			const ref = props?.ref ?? legacyRef
			// Hooks first, always in the same order, then Discord's own render (its hooks follow ours).
			const React = revenge.react.React
			const passRef = React.useCallback(
				(handle: any) => {
					if (handle && typeof handle.onMessageLengthChanged === 'function' && !handle.__charCounter) {
						const discords = handle.onMessageLengthChanged
						handle.onMessageLengthChanged = (value: number) => {
							setLength(value)
							return discords(value)
						}
						handle.__charCounter = true
					}
					if (typeof ref === 'function') ref(handle)
					else if (ref) ref.current = handle
				},
				[ref],
			)
			// Discord's hooks must still run (its ref handle is the feed); its drawing is not used.
			// Both places, so either Discord build picks it up.
			original({ ...props, ref: passRef }, passRef)
			React.useEffect(() => () => setLength(0), [])
			return null
		},
	)
}
