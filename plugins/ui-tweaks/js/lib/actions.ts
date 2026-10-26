/**
 * What a swipe stage can do, for patches/swipe.ts. Every action reads Discord's module when it runs
 * (porting rule 1), found by path on 350.4 (`docs/debugging`, hermes-dec of alpha 350204):
 *
 * - react: `modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx`
 *   `handleAddDefaultDoubleTapReaction(message, channel)` (your Discord double-tap emoji, with its
 *   permission and Nitro checks), or `modules/reactions/ReactionActionCreators.tsx`
 *   `addReaction(channelId, messageId, emoji, location)` / `removeReaction({channelId, messageId, emoji, location})`
 *   for a chosen emoji; toggles off when you already reacted with it.
 * - copy: `utils/ClipboardUtils.native.tsx` `copy(text)`.
 * - mention: `modules/autocompleter/native/AutocompleteUtils.tsx` `getMentionTextWithUser(channel, user)`
 *   into `chatInputRef.current.insertText(text, null, true)`, exactly what Discord's username tap does
 *   on Android (`handleTapUsername`).
 * - menu: the instance's own `handleLongPressMessage(event)`, the long-press path.
 * - unread: `modules/messages/markUnread.tsx` `markUnread(channelId, messageId)` (arguments not read
 *   from the bundle: verify on device).
 */

import type { SwipeAction } from '../defaults'
import { showToast } from '../../../../shared/toast'
import { reportError } from '../../../../shared/report'
import { Stores } from '@revenge-mod/discord/flux'
import * as discordFinders from '@revenge-mod/discord/utils/modules/finders'

const TAG = '[UITweaks]'
const TOAST = 'UITweaksSwipe'

function moduleAt(path: string): any {
	try {
		const found = (discordFinders as any).lookupModuleWithImportedPath(path)
		return Array.isArray(found) ? found[0] : found
	} catch {
		return undefined
	}
}

export interface SwipeTarget {
	instance: any
	event: any
	messageId: string | undefined
	message: any
	channel: any
	/** The instance's original reply and edit handlers. */
	reply?: (event: any) => unknown
	edit?: (event: any) => unknown
}

export function isOwn(message: any): boolean {
	const me = (Stores as any).UserStore?.getCurrentUser?.()?.id
	return Boolean(me && message?.author?.id === me)
}

function react(target: SwipeTarget, emoji: string) {
	const { message, channel } = target
	if (!message || !channel) return
	if (!emoji) {
		const utils = moduleAt('modules/double_tap_to_react/native/DoubleTapToReactUtils.tsx')
		const fn = utils?.handleAddDefaultDoubleTapReaction ?? utils?.default?.handleAddDefaultDoubleTapReaction
		if (typeof fn !== 'function') throw new Error("Discord's double-tap reaction isn't available")
		fn(message, channel)
		return
	}
	const actions = moduleAt('modules/reactions/ReactionActionCreators.tsx')
	const creators = actions?.addReaction ? actions : actions?.default
	if (typeof creators?.addReaction !== 'function') throw new Error("Discord's reactions aren't available")
	const location = creators.ReactionLocations?.DOUBLE_TAP ?? 'Double Tap'
	const reactEmoji = { id: null, name: emoji, animated: false }
	const mine = (message.reactions ?? []).some((r: any) => r?.emoji?.name === emoji && !r?.emoji?.id && (r?.me || r?.me_burst))
	if (mine) creators.removeReaction({ channelId: channel.id, messageId: message.id, emoji: reactEmoji, location })
	else creators.addReaction(channel.id, message.id, reactEmoji, location)
}

function copy(target: SwipeTarget) {
	const text = target.message?.content
	if (!text) {
		showToast('That message has no text to copy.', TOAST)
		return
	}
	const clipboard = moduleAt('utils/ClipboardUtils.native.tsx')
	const fn = clipboard?.copy ?? clipboard?.default?.copy
	if (typeof fn !== 'function') throw new Error("Discord's clipboard isn't available")
	fn(text)
	showToast('Copied.', TOAST)
}

function mention(target: SwipeTarget) {
	const { instance, message, channel } = target
	const user = message?.author?.id ? ((Stores as any).UserStore?.getUser?.(message.author.id) ?? message.author) : undefined
	if (!user) return
	const params = typeof instance.getParams === 'function' ? instance.getParams() : instance.params
	const input = params?.chatInputRef?.current
	if (typeof input?.insertText !== 'function') throw new Error("the message box isn't available")
	const utils = moduleAt('modules/autocompleter/native/AutocompleteUtils.tsx')
	const format = utils?.getMentionTextWithUser ?? utils?.default?.getMentionTextWithUser
	const text = typeof format === 'function' ? format(channel, user) : `<@${user.id}>`
	input.insertText(text, null, true)
}

function markUnread(target: SwipeTarget) {
	const { channel, message } = target
	if (!channel || !message) return
	const mod = moduleAt('modules/messages/markUnread.tsx')
	const fn = mod?.markUnread ?? mod?.default
	if (typeof fn !== 'function') throw new Error("Discord's mark unread isn't available")
	fn(channel.id, message.id)
	showToast('Marked unread from here.', TOAST)
}

/** Runs [action] for a swipe; `stage` decides what `stock` means. */
export function runSwipeAction(action: SwipeAction, stage: 'short' | 'long', target: SwipeTarget, emoji: string): unknown {
	const { instance, event } = target
	const reply = () => target.reply?.call(instance, event)
	try {
		switch (action) {
			case 'stock':
				// Discord's own: short = reply; long = edit on your messages, reply on others'.
				if (stage === 'long' && isOwn(target.message)) return target.edit?.call(instance, event)
				return reply()
			case 'reply':
				return reply()
			case 'edit':
				if (isOwn(target.message)) return target.edit?.call(instance, event)
				showToast('Only your own messages can be edited.', TOAST)
				return undefined
			case 'react':
				return react(target, emoji)
			case 'copy':
				return copy(target)
			case 'mention':
				return mention(target)
			case 'menu':
				if (typeof instance.handleLongPressMessage === 'function') return instance.handleLongPressMessage(event)
				throw new Error("the message menu isn't available")
			case 'unread':
				return markUnread(target)
			case 'nothing':
				return undefined
		}
	} catch (error) {
		reportError(`${TAG} swipe ${stage} (${action}) failed:`, error)
		showToast(`That swipe didn't work: ${(error as Error)?.message ?? error}`, TOAST)
	}
	return undefined
}

export const SWIPE_ACTIONS: Array<{ value: SwipeAction; label: string; subLabel: string }> = [
	{ value: 'stock', label: "Discord's", subLabel: 'Reply, or edit your own message on the further swipe' },
	{ value: 'reply', label: 'Reply', subLabel: 'Reply to the message' },
	{ value: 'edit', label: 'Edit', subLabel: 'Edit it, if it’s yours' },
	{ value: 'react', label: 'React', subLabel: 'Add your reaction, or take it back' },
	{ value: 'copy', label: 'Copy text', subLabel: "Copy the message's text" },
	{ value: 'mention', label: 'Mention', subLabel: 'Put @author in your message box' },
	{ value: 'menu', label: 'Open the menu', subLabel: 'The long-press menu for that message' },
	{ value: 'unread', label: 'Mark unread', subLabel: 'Mark the channel unread from that message' },
	{ value: 'nothing', label: 'Nothing', subLabel: 'The swipe does nothing' },
]
