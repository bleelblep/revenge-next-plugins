/**
 * Veil's rows in the message long-press sheet: the way rules are added.
 *
 * Typing channel and user ids into a settings page is not something anyone should have to do, so
 * the person and channel rules are set from the message that prompted them. The settings page
 * only lists them for removal.
 *
 * Same `openLazy` technique as Translate's `patches/messageActionSheet.tsx`, which documents why
 * (the sheet is found by its key, and `props` carries the message). Translate and Screenshot
 * Redactor hook the same method with `before`, which composes safely (porting rule 2).
 */

import { findInReactTree } from '../lib/findInReactTree'
import { repaintChannel } from '../lib/repaint'
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

function typeNameOf(node: any): string | undefined {
	const t = node?.type
	if (!t) return undefined
	return t.name || t.displayName || t.type?.name || t.type?.displayName || t.render?.name
}

const isRowGroup = (node: any) => /ActionSheetRowGroup$/.test(typeNameOf(node) ?? '')

function findGroupParent(tree: any): any {
	return findInReactTree(tree, (node: any) => {
		const children = node?.props?.children
		if (Array.isArray(children)) return children.some(isRowGroup)
		return isRowGroup(children)
	})
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

type Target = { channelId: string; authorId?: string }

function buildGroup(target: Target) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const { getAssetIdByName } = revenge.assets
	const s = settings()
	const { channelId, authorId } = target

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

	if (authorId && authorId !== currentUserId()) {
		const on = s.userIds.includes(authorId)
		act(
			on ? `Stop blurring ${userName(authorId)}` : `Blur messages from ${userName(authorId)}`,
			on ? 'Show their messages normally again' : 'Everywhere, until you undo it. Only you see this.',
			on ? 'EyeIcon' : 'EyeSlashIcon',
			() => toggleId('userIds', authorId, !on),
		)
	}

	const channelOn = s.channelIds.includes(channelId)
	act(
		channelOn ? `Stop blurring ${channelName(channelId)}` : `Blur everything in ${channelName(channelId)}`,
		channelOn ? 'Show this channel normally again' : 'Every message here, until you undo it',
		channelOn ? 'EyeIcon' : 'EyeSlashIcon',
		() => toggleId('channelIds', channelId, !channelOn),
	)

	const category = s.customCategory.trim()
	if (category) {
		const aiOn = s.aiChannelIds.includes(channelId)
		act(
			aiOn ? 'Stop checking this channel' : `Check this channel for “${category}”`,
			aiOn
				? 'Messages here stop going to AI Core'
				: "Sends messages here to AI Core's provider and blurs the ones that match",
			'MagicWandIcon',
			() => toggleId('aiChannelIds', channelId, !aiOn),
		)
	}

	return <ActionSheetRow.Group key="veil">{rows}</ActionSheetRow.Group>
}

function inject(rendered: any, target: Target): boolean {
	const group = buildGroup(target)
	if (!group) return false

	const parent = findGroupParent(rendered)
	const holder = parent ?? rendered
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
					typeof key === 'string' &&
					isMessageSheet(key) &&
					typeof channelId === 'string' &&
					sheet &&
					typeof sheet.then === 'function'
				) {
					current = { channelId, authorId: message?.author?.id }
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
