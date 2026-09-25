/**
 * Replies that do not ping by default.
 *
 * ## Where the default lives
 *
 * Starting a reply -- the long-press option or the swipe gesture -- calls `createPendingReply` or
 * `createShallowPendingReply` with an object carrying `shouldMention`. That value is what the @
 * toggle above the chat box shows, and what the eventual send uses for `allowed_mentions`. Setting
 * it to `false` here means the reply *starts* with the toggle off; tapping it back on still works
 * exactly as before, for the one reply where you do want the ping.
 *
 * That is deliberately softer than stripping the mention at send time, which would silently
 * override the toggle when you had turned it on.
 *
 * ## Sharing these methods with Ghost Log Native Beta
 *
 * Ghost Log Native Beta has an `instead` hook on both methods, to refuse replies to deleted
 * messages. These are wrapped with a plain function rather than a patcher `before`, for the same
 * reason as sending (`lib/wrap.ts`): if any other plugin adds a second `instead`, a patcher hook
 * that started first would make the pair recurse. Nothing here may ever become an `instead` itself.
 */

import { whenModule } from '../lib/finder'
import { wrapMethod } from '../lib/wrap'
import { debug, settings, TAG } from '../lib/state'

const METHODS = ['createPendingReply', 'createShallowPendingReply'] as const

const status = { installed: false, silenced: 0 }

export function replyStatus() {
	return { ...status }
}

export default function patchReplyMention(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		whenModule(['createPendingReply'], (host, id) => {
			for (const method of METHODS) {
				if (typeof host?.[method] !== 'function') continue

				patches.push(
					wrapMethod(host, method, args => {
						try {
							const reply = args?.[0]
							// Only an object that is plainly a pending reply is touched: it either
							// already carries `shouldMention`, or it has the message and channel a
							// reply is built from. The swipe path may omit the key entirely, and
							// requiring it would leave swiped replies pinging.
							const isReply =
								reply &&
								typeof reply === 'object' &&
								('shouldMention' in reply ||
									('message' in reply && 'channel' in reply))
							if (
								settings().noReplyMention &&
								isReply &&
								reply.shouldMention !== false
							) {
								reply.shouldMention = false
								status.silenced++
								debug(`${method}: reply started with mention off`)
							}
						} catch (error) {
							console.error(`${TAG} ${method} hook failed:`, error)
						}
					}),
				)
			}

			status.installed = true
			console.log(`${TAG} reply mention default hooked on module ${id}`)
		}),
	)

	return () => {
		status.installed = false
		for (const unpatch of patches.reverse()) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
