/**
 * "TL;DR" in the message long-press sheet, for long messages only.
 *
 * Same `openLazy` technique as Translate's `patches/messageActionSheet.tsx`, which documents why.
 * Translate, Screenshot Redactor and Veil hook the same method with `before`, which composes
 * safely (porting rule 2); each adds its own group.
 *
 * The answer is shown in an alert, not sent anywhere: nothing is posted, nothing is stored past
 * the session, and closing it leaves the chat exactly as it was.
 */

import { findInReactTree } from '../lib/findInReactTree'
import { debug, settings, TAG, toast } from '../lib/state'
import { readableMentions, summarise, textOf } from '../lib/summarise'

const SYM_PATCHED = Symbol.for('Patched by TLDR')

const status = { lastKey: '', offered: 0, summarised: 0 }

export function sheetStatus() {
	return { ...status }
}

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

type Target = { messageId: string; editedTimestamp: unknown; text: string }

function showResult(title: string, body: string) {
	const { AlertModal, AlertActionButton } = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators
	const key = 'TldrResult'
	try {
		Alerts.openAlert(
			key,
			<AlertModal
				title={title}
				content={body}
				actions={
					<AlertActionButton
						text="Done"
						variant="secondary"
						onPress={() => Alerts.dismissAlert(key)}
					/>
				}
			/>,
		)
	} catch (error) {
		console.error(`${TAG} could not open the result:`, error)
		toast(body.slice(0, 120))
	}
}

async function run(target: Target) {
	toast('Summarising…')
	const result = await summarise(target.messageId, target.editedTimestamp, target.text)
	if (result.problem) {
		showResult("Couldn't summarise this", result.problem)
		return
	}
	status.summarised++
	showResult('TL;DR', readableMentions(result.text ?? ''))
}

function buildGroup(target: Target) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const { getAssetIdByName } = revenge.assets

	return (
		<ActionSheetRow.Group key="tldr">
			<ActionSheetRow
				label="TL;DR"
				subLabel="The gist in a few lines. Only you see it."
				icon={<ActionSheetRow.Icon source={getAssetIdByName('MagicWandIcon')} />}
				onPress={() => {
					try {
						revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
					} catch {
						/* most rows close the sheet themselves */
					}
					// Not awaited: the sheet closes now and the answer opens when it lands.
					run(target).catch(error => {
						console.error(`${TAG} summary failed:`, error)
						showResult("Couldn't summarise this", 'Something went wrong. See the debug log.')
					})
				}}
			/>
		</ActionSheetRow.Group>
	)
}

function inject(rendered: any, target: Target): boolean {
	const group = buildGroup(target)
	if (!group) return false

	const holder = findGroupParent(rendered) ?? rendered
	const children = holder?.props?.children
	if (Array.isArray(children)) {
		children.unshift(group)
		return true
	}
	if (children) {
		holder.props.children = [group, children]
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
				if (typeof key === 'string') status.lastKey = key
				current = undefined
				const message = props?.message
				const text = textOf(message)
				if (
					typeof key === 'string' &&
					isMessageSheet(key) &&
					typeof message?.id === 'string' &&
					text.length >= settings().minLength &&
					sheet &&
					typeof sheet.then === 'function'
				) {
					current = {
						messageId: message.id,
						editedTimestamp: message.editedTimestamp ?? message.edited_timestamp,
						text,
					}
					status.offered++
					debug(`offering on ${key}: ${text.length} characters`)
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
