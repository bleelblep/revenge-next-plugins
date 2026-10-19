/**
 * "Pronouns…" in the message long-press sheet: the per-user override entry point.
 *
 * The badge itself is drawn natively from row data, so it can't take presses — the long-press
 * sheet is the closest long-press flow. This hooks `ActionSheetActionCreators.openLazy` and
 * injects a row into the sheet the same way Screenshot Redactor does
 * (`plugins/screenshot-redactor/js/patches/messageActionSheet.tsx`), whose header comment explains
 * the choices here: the sheet module's name is unknown (openLazy's key names it), and the row
 * groups are found inside the real ActionSheet with the shared `findMessageSheetGroupParent`.
 */

import { findMessageSheetGroupParent } from '../../../../shared/messageSheet'
import { showToast } from '../../../../shared/toast'
import { isOnActiveList, setOnActiveList } from '../lib/filter'
import { promptOverride } from '../lib/promptOverride'
import { settings } from '../lib/state'
import * as assets from '@revenge-mod/assets'
import * as actions from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import * as finders from '@revenge-mod/modules/finders'
import * as filters from '@revenge-mod/modules/finders/filters'
import { after, before } from '@revenge-mod/patcher'
import { reportError } from '../../../../shared/report'

const TAG = '[Pronouns]'

function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		// Looked up lazily, at the moment a sheet actually opens: lookupModule permanently caches
		// a miss, and this module is sheet UI that may not have loaded yet on a cold launch.
		const { lookupModule } = finders
		const { withProps } = filters
		actionSheetRow = lookupModule<any>(withProps('ActionSheetRow'))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

/** The message the sheet is about, from the stashed props or a walk of the rendered tree. */
function findMessage(rendered: any, fromProps?: any): any {
	if (fromProps?.message?.author) return fromProps.message
	const seen = new Set<any>()
	let found: any
	const visit = (node: any, depth: number) => {
		if (found || !node || depth > 30 || seen.has(node)) return
		seen.add(node)
		if (node.props?.message?.author && !found) {
			found = node.props.message
			return
		}
		if (Array.isArray(node)) {
			for (const child of node) visit(child, depth + 1)
		} else {
			visit(node.props?.children, depth + 1)
		}
	}
	visit(rendered, 0)
	return found
}

function promptOverrideFor(message: any) {
	const authorId = String(message.author?.id ?? '')
	if (!authorId) return
	const authorName = message.author?.globalName ?? message.author?.username ?? 'this person'
	promptOverride(authorId, authorName)
}

function buildRow(message: any) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	const authorId = String(message?.author?.id ?? '')
	if (!authorId) return null

	const { getAssetIdByName } = assets
	const existing = settings().overrides?.[authorId]
	const label = typeof existing === 'string' ? `Pronouns: ${existing}` : 'Pronouns…'

	const onPress = () => {
		try {
			actions.ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* most rows close the sheet themselves; not worth failing the dialog over */
		}
		promptOverrideFor(message)
	}

	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label={label}
				subLabel="Set or clear what the badge next to their name shows"
				icon={<ActionSheetRow.Icon source={getAssetIdByName('UserCircleIcon')} />}
				onPress={onPress}
			/>
			{filterRow(message, ActionSheetRow)}
		</ActionSheetRow.Group>
	)
}

/** "Show / hide their pronouns", for the list the current mode edits; none in "everyone" mode. */
function filterRow(message: any, ActionSheetRow: any) {
	const mode = settings().filterMode
	if (mode !== 'only' && mode !== 'except') return null
	const authorId = String(message.author.id)
	const authorName = message.author?.globalName ?? message.author?.username ?? authorId
	const listed = isOnActiveList(authorId)
	// On the show list = shown; on the hide list = hidden.
	const shown = mode === 'only' ? listed : !listed
	const { getAssetIdByName } = assets
	const onPress = () => {
		try {
			actions.ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* see buildRow */
		}
		try {
			setOnActiveList(authorId, authorName, !listed)
			showToast(shown ? `Hiding pronouns for ${authorName}.` : `Showing pronouns for ${authorName}.`, 'PronounsFilterToast')
		} catch (error) {
			reportError(`${TAG} updating the list failed:`, error)
		}
	}
	return (
		<ActionSheetRow
			label={shown ? 'Hide their pronouns' : 'Show their pronouns'}
			subLabel={mode === 'only' ? 'Badges only show for people you pick' : 'Badges show for everyone but people you hid'}
			icon={<ActionSheetRow.Icon source={getAssetIdByName(shown ? 'EyeSlashIcon' : 'EyeIcon')} />}
			onPress={onPress}
		/>
	)
}

function inject(rendered: any, message: any): boolean {
	const row = buildRow(message)
	if (!row) return false
	const { ActionSheet } = Design as any
	const parent = findMessageSheetGroupParent(rendered, ActionSheet, ActionSheetRowComponent()?.Group)
	if (!parent) return false
	const children = parent.props.children
	if (Array.isArray(children)) {
		children.unshift(row)
	} else {
		// Single child: promote it to an array so the new group can sit alongside it. Mutating a
		// rendered element's props is how staff-tags adds its tag too — React only freezes props
		// in development builds.
		parent.props.children = [row, children]
	}
	return true
}

const patchedModules = new WeakSet<any>()

function patchSheetModule(mod: any, patches: Array<() => void>): any {
	if (!mod || typeof mod.default !== 'function') return mod
	if (patchedModules.has(mod)) return mod
	let pendingMessage: any

	patches.push(
		before(mod, 'default', (args: any[]) => {
			pendingMessage = args?.[0]?.message
			return args
		}),
	)
	patches.push(
		after(mod, 'default', (rendered: any) => {
			try {
				if (rendered != null) inject(rendered, pendingMessage ?? findMessage(rendered, pendingMessage))
			} catch (error) {
				reportError(`${TAG} sheet injection failed:`, error)
			}
			pendingMessage = undefined
			return rendered
		}),
	)
	patchedModules.add(mod)
	return mod
}

export default function patchMessageSheet(): () => void {
	const { ActionSheetActionCreators } = actions
	const patches: Array<() => void> = []

	patches.push(
		before(ActionSheetActionCreators as any, 'openLazy', (args: any[]) => {
			try {
				const [sheet, key] = args
				if (typeof key === 'string' && isMessageSheet(key) && sheet && typeof sheet.then === 'function') {
					// A *derived* promise, not a `.then` bolted onto theirs: the sheet component
					// openLazy receives cannot resolve until after the row has been added, so
					// there is no race with their own resolution handler.
					args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
				}
			} catch (error) {
				reportError(`${TAG} openLazy hook failed:`, error)
			}
			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook. Outside the try so it survives a throw above.
			return args
		}),
	)

	return () => {
		patches.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
