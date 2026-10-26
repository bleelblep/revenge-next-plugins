/**
 * Double-tap a message: reply on others' messages, edit your own (Better Chat Gestures' idea, by
 * Rosie, Unlicense; written fresh here).
 *
 * Wraps `MessagesHandlers.handleDoubleTapMessage` through lib/handlers.ts, which explains how the
 * instances are caught on 350.2 and 350.4. The edit/reply calls go to the ORIGINAL
 * `handleInitiateEdit`/`handleInitiateReply`, not the instance's current ones: those may be the
 * swipe tweak's wrappers (patches/swipe.ts), which would treat a double-tap as a swipe.
 *
 * Discord's own double-tap (`handleAddDefaultDoubleTapReaction`) runs when the tweak is off or the
 * message can't be resolved.
 */

import { originalHandler, wrapHandler } from '../lib/handlers'
import { settings } from '../lib/state'
import { Stores } from '@revenge-mod/discord/flux'
import { reportError } from '../../../../shared/report'

const TAG = '[UITweaks]'

export default (): (() => void) =>
	wrapHandler('handleDoubleTapMessage', (instance, original) =>
		function handleDoubleTapMessage(this: unknown, event: any) {
			try {
				if (settings().doubleTapReply) {
					const messageId = event?.nativeEvent?.messageId ?? event?.messageId
					const data = messageId != null ? instance.getMessageData?.(messageId) : undefined
					const me = (Stores as any).UserStore?.getCurrentUser?.()?.id
					const edit = originalHandler(instance, 'handleInitiateEdit') ?? instance.handleInitiateEdit
					const reply = originalHandler(instance, 'handleInitiateReply') ?? instance.handleInitiateReply
					// handleInitiateEdit checks edit permission itself and does nothing when it fails.
					if (me && data?.message?.author?.id === me && typeof edit === 'function') return edit.call(instance, event)
					// Reply resolves the message from the event itself, so it also covers an unreadable id.
					if (typeof reply === 'function') return reply.call(instance, event)
				}
			} catch (error) {
				reportError(`${TAG} double-tap failed:`, error)
			}
			return original.call(this, event)
		},
	)
