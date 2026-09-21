/**
 * Rewriting a message's text on its way out -- both new messages and edits.
 *
 * ## `before`, alongside Second Thoughts
 *
 * Second Thoughts owns the one `instead` hook on `sendMessage`. A `before` hook composes with it
 * safely (porting rule 2: the recursion trap needs *two* `instead` hooks), and runs first, which
 * is the order wanted: Second Thoughts then judges the text that will actually be sent, cleaned
 * links and replaced words included, rather than the draft before this changed it.
 *
 * ## Only the text is touched
 *
 * The message object's `content` is replaced and nothing else. Attachments, stickers, reply
 * references and allowed mentions pass through exactly as Discord built them. A hook that returns
 * without changing anything leaves the send identical to one without this plugin installed.
 *
 * Every path returns the args array, including when something throws: a `before` hook that
 * returns nothing sets the arguments to `undefined` for every later hook (porting rule 2), which
 * on this method would break sending outright.
 */

import { whenModule } from '../lib/finder'
import { debug, settings, TAG } from '../lib/state'
import { transform } from '../lib/transform'

const status = {
	installed: false,
	moduleId: -1,
	sends: 0,
	edits: 0,
	cleaned: 0,
	replaced: 0,
}

export function outgoingStatus() {
	return { ...status }
}

function rewrite(message: any, kind: 'send' | 'edit') {
	if (!message || typeof message.content !== 'string' || !message.content)
		return

	const result = transform(message.content)
	if (result.text === message.content) return

	message.content = result.text
	status.cleaned += result.cleaned
	status.replaced += result.replaced
	if (kind === 'send') status.sends++
	else status.edits++
	debug(
		`${kind}: ${result.cleaned} tracking param(s) removed, ${result.replaced} rule(s) applied`,
	)
}

export default function patchOutgoing(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		whenModule(
			['sendMessage', 'editMessage', 'startEditMessage'],
			(host, id) => {
				patches.push(
					revenge.patcher.before(host, 'sendMessage', (args: any[]) => {
						try {
							// sendMessage(channelId, message, ...)
							rewrite(args?.[1], 'send')
						} catch (error) {
							console.error(`${TAG} send rewrite failed:`, error)
						}
						return args
					}),
				)

				patches.push(
					revenge.patcher.before(host, 'editMessage', (args: any[]) => {
						try {
							// editMessage(channelId, messageId, { content })
							if (settings().applyToEdits) rewrite(args?.[2], 'edit')
						} catch (error) {
							console.error(`${TAG} edit rewrite failed:`, error)
						}
						return args
					}),
				)

				status.installed = true
				status.moduleId = id
				// Log the outcome, not the attempt -- porting rule 3.
				console.log(`${TAG} rewriting outgoing messages on module ${id}`)
			},
		),
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
