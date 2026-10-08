/**
 * Veil's rows in the message long-press sheet: the way rules are added.
 *
 * Typing channel and user ids into a settings page is not something anyone should have to do, so
 * the person and channel rules are set from the message that prompted them. The settings page
 * only lists them for removal.
 *
 * Each row can be switched off in settings (`sheetBlurPerson`, `sheetBlurChannel`),
 * and the whole group with `sheetActions`. With every row off, no group is added at all.
 *
 * Same `openLazy` technique as Translate's `patches/messageActionSheet.tsx`, which documents why
 * (the sheet is found by its key, and `props` carries the message). Translate and Screenshot
 * Redactor hook the same method with `before`, which composes safely (porting rule 2).
 */

import { findMessageSheetGroupParent } from '../../../../shared/messageSheet'
import { repaintChannel } from '../lib/repaint'
import { hasStickerRules } from '../lib/rules'
import { setStickersRevealed, stickersRevealed } from './rows'
import {
	channelName,
	currentUserId,
	debug,
	settings,
	TAG,
	toggleId,
	userName,
} from '../lib/state'

const SYM_PATCHED = Symbol.for('Patched by Veil')

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

function findGroupParent(tree: any): any {
	return findMessageSheetGroupParent(tree, revenge.discord.design.Design.ActionSheet, ActionSheetRowComponent()?.Group)
}

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		// At sheet time, not start(): a `lookupModule` miss is cached for the session (rule 3).
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		actionSheetRow = lookupModule<any>(withProps('ActionSheetRow'))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

function closeSheet() {
	try {
		revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
	} catch {
		/* most rows close the sheet themselves */
	}
}

type Target = { channelId: string; authorId?: string; messageId?: string; hasStickers?: boolean }

function buildGroup(target: Target) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const { getAssetIdByName } = revenge.assets
	const s = settings()
	const { channelId, authorId, messageId, hasStickers } = target

	const rows: any[] = []
	const act = (label: string, subLabel: string, icon: string, run: () => void) =>
		rows.push(
			<ActionSheetRow
				key={label}
				label={label}
				subLabel={subLabel}
				icon={<ActionSheetRow.Icon source={getAssetIdByName(icon)} />}
				onPress={() => {
					closeSheet()
					try {
						run()
						repaintChannel(channelId)
					} catch (error) {
						console.error(`${TAG} sheet action failed:`, error)
					}
				}}
			/>,
		)

	// Hidden stickers have no spoiler to tap, so this is how one comes back. Shown whenever Veil
	// may have hidden it: a blurred message's, or one a rule matched by name.
	if (hasStickers && messageId && (s.blurMedia || hasStickerRules())) {
		const shown = stickersRevealed(messageId)
		act(
			shown ? 'Hide sticker again' : 'Show sticker',
			shown ? 'Veil hides it again' : 'Just this message, until Discord restarts',
			shown ? 'EyeSlashIcon' : 'EyeIcon',
			() => setStickersRevealed(messageId, !shown),
		)
	}

	if (!s.sheetActions) {
		if (!rows.length) return null
		return <ActionSheetRow.Group key="veil">{rows}</ActionSheetRow.Group>
	}

	if (s.sheetBlurPerson && authorId && authorId !== currentUserId()) {
		const on = s.userIds.includes(authorId)
		act(
			on ? `Stop blurring ${userName(authorId)}` : `Blur messages from ${userName(authorId)}`,
			on ? 'Show their messages normally again' : 'Everywhere, until you undo it. Only you see this.',
			on ? 'EyeIcon' : 'EyeSlashIcon',
			() => toggleId('userIds', authorId, !on),
		)
	}

	if (s.sheetBlurChannel) {
		const channelOn = s.channelIds.includes(channelId)
		act(
			channelOn ? `Stop blurring ${channelName(channelId)}` : `Blur everything in ${channelName(channelId)}`,
			channelOn ? 'Show this channel normally again' : 'Every message here, until you undo it',
			channelOn ? 'EyeIcon' : 'EyeSlashIcon',
			() => toggleId('channelIds', channelId, !channelOn),
		)
	}

	if (!rows.length) return null
	return <ActionSheetRow.Group key="veil">{rows}</ActionSheetRow.Group>
}

function inject(rendered: any, target: Target): boolean {
	const group = buildGroup(target)
	if (!group) return false

	const holder = findGroupParent(rendered)
	const children = holder?.props?.children
	if (Array.isArray(children)) {
		// After the first group, so Discord's own reply/copy row stays at the top.
		children.splice(Math.min(1, children.length), 0, group)
		return true
	}
	if (children) {
		holder.props.children = [children, group]
		return true
	}
	return false
}

const patchedModules = new WeakSet<any>()
/** Set on every `openLazy`, never captured by the sheet patch (Translate 0.5.1's bug). */
let current: Target | undefined

function patchSheetModule(mod: any, patches: Array<() => void>) {
	if (!mod || typeof mod.default !== 'function' || patchedModules.has(mod)) return mod

	const applyTo = (rendered: any) => {
		try {
			if (current && rendered != null && !rendered[SYM_PATCHED] && inject(rendered, current))
				rendered[SYM_PATCHED] = true
		} catch (error) {
			console.error(`${TAG} sheet injection failed:`, error)
		}
		return rendered
	}

	try {
		patches.push(revenge.patcher.after(mod, 'default', applyTo))
		patchedModules.add(mod)
		return mod
	} catch {
		try {
			const Original = mod.default
			return { ...mod, default: (props: any) => applyTo(Original(props)) }
		} catch (error) {
			console.error(`${TAG} could not patch sheet module:`, error)
			return mod
		}
	}
}

export default function patchMessageSheet(): () => void {
	const { ActionSheetActionCreators } = revenge.discord.actions
	const patches: Array<() => void> = []

	patches.push(
		revenge.patcher.before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key, props] = args
				current = undefined
				const message = props?.message
				const channelId = message?.channel_id ?? props?.channel?.id
				if (
					settings().enabled &&
					(settings().sheetActions || hasStickerRules()) &&
					typeof key === 'string' &&
					isMessageSheet(key) &&
					typeof channelId === 'string' &&
					sheet &&
					typeof sheet.then === 'function'
				) {
					const stickerCount = (message?.stickerItems ?? message?.sticker_items ?? message?.stickers ?? []).length
					current = {
						channelId,
						authorId: message?.author?.id,
						messageId: typeof message?.id === 'string' ? message.id : undefined,
						hasStickers: stickerCount > 0,
					}
					debug(`sheet ${key} for ${channelId}`)
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				console.error(`${TAG} openLazy hook failed:`, error)
			}
			// A before-hook must return the args array (porting rule 2).
			return args
		}),
	)

	return () => {
		for (const unpatch of patches) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
