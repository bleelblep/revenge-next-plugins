/**
 * Rewriting a message's text on its way out -- both new messages and edits.
 *
 * ## A plain wrapper, not a patcher hook
 *
 * `sendMessage` and `editMessage` are `instead`-hooked by other plugins (fake-nitro, Zipline,
 * message-tweaks, and our own Second Thoughts). A patcher `before` registered ahead of two of those
 * made them recurse forever, and edits failed to save for anyone with that combination. So both
 * methods are wrapped with a plain function instead; `lib/wrap.ts` explains why that cannot recurse.
 *
 * The cost: when Second Thoughts' `instead` is added after this wrapper, it judges the draft before
 * links are cleaned rather than after. Tracking parameters and your rules do not change what it looks
 * for, so the verdict is the same.
 *
 * ## Only the text is touched
 *
 * The message object's `content` is replaced and nothing else. Attachments, stickers, reply
 * references and allowed mentions pass through exactly as Discord built them. A hook that returns
 * without changing anything leaves the send identical to one without this plugin installed.
 *
 * The rewrite changes the message object in place and never throws out of the wrapper, so a failure
 * sends the message exactly as typed.
 *
 * ## Edits are cleaned when the edit box opens, not only when it is saved
 *
 * Discord skips `editMessage` entirely when the edited text is identical to the original, so a
 * hook there alone never ran on "open edit, save" -- the obvious way to clean an old message's
 * link. Cleaning the draft carried by `MESSAGE_START_EDIT` fixes that: the edit box opens with
 * the cleaned text, which now differs from the original, so saving goes through. You also see
 * the result before saving, and can cancel. The `editMessage` hook stays for text typed or
 * pasted into the box afterwards.
 *
 * A Flux patch rather than a hook on `startEditMessage`: that export and
 * `startEditMessageRecord` both end in this one event, and the latter may call the former
 * without going through the export. Returning nothing from a Flux patch blocks the event, so
 * every path returns a payload.
 */

import { whenModule } from '../lib/finder'
import { wrapMethod } from '../lib/wrap'
import { debug, settings, TAG } from '../lib/state'
import { transform } from '../lib/transform'

const status = {
	installed: false,
	moduleId: -1,
	sends: 0,
	edits: 0,
	/** Edit boxes opened with already-cleaned text. */
	drafts: 0,
	cleaned: 0,
	replaced: 0,
	/** Links changed by a link rule. */
	rewritten: 0,
}

export function outgoingStatus() {
	return { ...status }
}

function rewrite(message: any, kind: 'send' | 'edit' | 'draft') {
	if (!message || typeof message.content !== 'string' || !message.content)
		return

	const result = transform(message.content)
	if (result.text === message.content) return

	message.content = result.text
	status.cleaned += result.cleaned
	status.replaced += result.replaced
	status.rewritten += result.rewritten
	if (kind === 'send') status.sends++
	else if (kind === 'edit') status.edits++
	else status.drafts++
	debug(
		`${kind}: ${result.cleaned} tracking param(s) removed, ${result.rewritten} link(s) rewritten, ${result.replaced} rule(s) applied`,
	)
}

export default function patchOutgoing(): () => void {
	const patches: Array<() => void> = []

	patches.push(
		revenge.discord.flux.onFluxEventDispatched(
			'MESSAGE_START_EDIT',
			(payload: any) => {
				try {
					if (!settings().applyToEdits) return payload
					// A copy, so nothing else holding the original payload sees it change.
					const draft = { ...payload }
					rewrite(draft, 'draft')
					return draft
				} catch (error) {
					console.error(`${TAG} edit draft rewrite failed:`, error)
					return payload
				}
			},
		),
	)

	patches.push(
		whenModule(
			['sendMessage', 'editMessage', 'startEditMessage'],
			(host, id) => {
				// sendMessage(channelId, message, ...)
				patches.push(wrapMethod(host, 'sendMessage', args => rewrite(args[1], 'send')))

				// editMessage(channelId, messageId, { content })
				patches.push(
					wrapMethod(host, 'editMessage', args => {
						if (settings().applyToEdits) rewrite(args[2], 'edit')
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
