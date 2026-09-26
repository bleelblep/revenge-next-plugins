/**
 * "Translate" in the message long-press sheet.
 *
 * ## Why `openLazy` rather than the sheet module
 *
 * Every action sheet is opened through `ActionSheetActionCreators.openLazy(sheet, key, props)` —
 * a typed, confirmed API — and the `key` names the sheet. Hooking that finds the message sheet
 * without having to guess its module name, which Screenshot Redactor spent a release doing
 * wrongly before arriving at this approach. The same file is the reference for everything below;
 * this is the leaner version of it, and the two are deliberately the same shape.
 *
 * It also hands us `props`, which is where the message itself lives — the thing this plugin
 * actually needs and the redactor did not.
 *
 * ## Two plugins, one hook
 *
 * Screenshot Redactor also `before`-hooks `openLazy`. That composes safely: `before` and `after`
 * chains are plain linked lists, and only `instead` has the recursion trap (porting rule 2).
 * Both insert their own group, so the order they appear in is whichever ran last — cosmetic, and
 * not worth coordinating over.
 */

import { findInReactTree } from '../lib/findInReactTree'
import { debug, settings } from '../lib/state'
import { rowStateFor, toggleTranslation } from '../lib/translate'

const SYM_PATCHED = Symbol.for('Patched by Translate')

/** Records what actually happened, for the Debug page. Porting rule 3. */
const status = { lastKey: '', injected: false, lastError: '' }

export function sheetStatus(): {
	lastKey: string
	injected: boolean
	lastError: string
} {
	return { ...status }
}

/**
 * Keeps a failure inside our row from taking the whole sheet -- and the app -- with it.
 *
 * A render error in an action sheet has no boundary of Discord's above it, and on a release
 * build an uncaught render error is fatal: the app closes to the home screen. Users on 348.1
 * reported exactly that on every long-press with Translate enabled, from a setup we could not
 * reproduce. With this in place the worst case is a missing row, and the error lands on the
 * Debug page instead of in a crash.
 *
 * Built on first use rather than at module scope (porting rule 1), and cached so every sheet
 * reuses one class: a new class per render would remount the row each time.
 */
let RowBoundary: any
function getRowBoundary(): any {
	if (RowBoundary) return RowBoundary
	const { React } = revenge.react

	RowBoundary = class TranslateRowBoundary extends React.Component<
		{ children?: any },
		{ failed: boolean }
	> {
		state = { failed: false }

		static getDerivedStateFromError() {
			return { failed: true }
		}

		componentDidCatch(error: unknown) {
			status.lastError = String((error as any)?.stack ?? error).slice(0, 500)
			console.error('[Translate] sheet row failed to render:', error)
		}

		render() {
			return this.state.failed ? null : this.props.children
		}
	}
	return RowBoundary
}

/**
 * Loose on purpose — the exact key is unknown, and the cost of a false positive is a Translate
 * row in one sheet too many, while the cost of a false negative is the feature not existing.
 */
function isMessageSheet(key: string) {
	return /message/i.test(key) && !/channel|forum|guild|thread/i.test(key)
}

/**
 * A component's name, however it is wrapped. `type.name` alone is not enough: a `React.memo()`
 * wrapper has no name of its own, and `forwardRef` hides it under `render` (porting rule 3).
 */
function typeNameOf(node: any): string | undefined {
	const t = node?.type
	if (!t) return undefined
	return (
		t.name ||
		t.displayName ||
		t.type?.name ||
		t.type?.displayName ||
		t.render?.name ||
		undefined
	)
}

const isRowGroup = (node: any) =>
	/ActionSheetRowGroup$/.test(typeNameOf(node) ?? '')

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
		// Looked up at the moment a sheet opens rather than from start(): `lookupModule`
		// permanently caches a miss, and this is sheet UI that may not have loaded on a cold
		// launch. By the time a sheet is rendering, it has (porting rule 3).
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		actionSheetRow = lookupModule<any>(withProps('ActionSheetRow'))?.[0]
			?.ActionSheetRow
	}
	return actionSheetRow
}

function buildRow(channelId: string, messageId: string, text: string) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null

	const { getAssetIdByName } = revenge.assets
	const { TableRowIcon } = revenge.discord.design.Design as any
	const target = settings().target

	// The same row does both directions, so the label has to say which one it is about to do.
	const state = rowStateFor(messageId)
	const label =
		state === 'show-original'
			? 'Show original'
			: state === 'working'
				? 'Translating…'
				: 'Translate'
	const subLabel =
		state === 'show-original'
			? 'Put the message back as it was written'
			: `Into ${target}. Only you will see it.`

	const onPress = () => {
		try {
			revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
		} catch {
			/* most rows close the sheet themselves */
		}
		// Not awaited: the sheet should close now, and the row updates when the answer lands.
		toggleTranslation(channelId, messageId, text).catch(error => {
			console.error('[Translate] translation failed:', error)
		})
	}

	const source = getAssetIdByName(
		state === 'show-original' ? 'ArrowAngleLeftUpIcon' : 'GlobeEarthIcon',
	)
	// `ActionSheetRow.Icon` is the sheet's own icon and is what every other row uses; the
	// `TableRowIcon` fallback is only for a build that does not expose it (348.1 does).
	const Icon = ActionSheetRow.Icon ?? TableRowIcon
	const icon = Icon && source ? <Icon source={source} /> : undefined

	const row = (
		<ActionSheetRow
			label={label}
			subLabel={subLabel}
			icon={icon}
			onPress={onPress}
		/>
	)

	// Wrapped in a Group, which is what draws the rounded card around a row. Without it the row
	// renders square-cornered against every other group in the sheet -- 0.5.3 dropped the wrapper
	// and that is exactly how it looked. A build without `Group` gets the bare row rather than
	// an element of type `undefined`, which React refuses to render at all.
	const Group = ActionSheetRow.Group
	const Boundary = getRowBoundary()
	return (
		<Boundary key="translate">
			{typeof Group === 'function' || typeof Group === 'object' ? (
				<Group>{row}</Group>
			) : (
				row
			)}
		</Boundary>
	)
}

function inject(
	rendered: any,
	channelId: string,
	messageId: string,
	text: string,
): boolean {
	const row = buildRow(channelId, messageId, text)
	if (!row) return false

	const parent = findGroupParent(rendered)
	if (parent) {
		const children = parent.props.children
		if (Array.isArray(children)) children.unshift(row)
		// Single child: promote it to an array so the new group can sit alongside it. React only
		// freezes props in development builds.
		else parent.props.children = [row, children]
		return true
	}

	// No recognisable group: aim for the sheet's own children. Less precise, but a row in an odd
	// place beats a feature that silently does not exist.
	const children = rendered?.props?.children
	if (Array.isArray(children)) {
		children.unshift(row)
		return true
	}
	if (children) {
		rendered.props.children = [row, children]
		return true
	}

	return false
}

const patchedModules = new WeakSet<any>()

/**
 * The message whose sheet is opening, set on every `openLazy`.
 *
 * The sheet module is patched once and that patch serves every later sheet, so it must not capture
 * the message it was first patched for. Closing over the first long-press's ids is exactly what
 * made every later sheet offer to translate that first message again (0.5.1).
 */
let current: { channelId: string; messageId: string; text: string } | undefined

function patchSheetModule(mod: any, patches: Array<() => void>) {
	if (!mod || typeof mod.default !== 'function') return mod
	if (patchedModules.has(mod)) return mod

	const applyTo = (rendered: any) => {
		try {
			const target = current
			if (
				target &&
				rendered != null &&
				!rendered[SYM_PATCHED] &&
				inject(rendered, target.channelId, target.messageId, target.text)
			) {
				rendered[SYM_PATCHED] = true
				status.injected = true
			}
		} catch (error) {
			console.error('[Translate] sheet injection failed:', error)
		}
		return rendered
	}

	try {
		patches.push(revenge.patcher.after(mod, 'default', applyTo))
		patchedModules.add(mod)
		return mod
	} catch {
		// Frozen namespace: hand back a copy rather than mutating theirs.
		try {
			const Original = mod.default
			return { ...mod, default: (props: any) => applyTo(Original(props)) }
		} catch (error) {
			console.error('[Translate] could not patch sheet module:', error)
			return mod
		}
	}
}

/** The text worth translating, from whatever shape the sheet was handed. */
function textOf(message: any): string {
	if (!message) return ''
	if (typeof message.content === 'string') return message.content
	return ''
}

export default function patchMessageActionSheet(): () => void {
	const { ActionSheetActionCreators } = revenge.discord.actions
	const patches: Array<() => void> = []

	patches.push(
		revenge.patcher.before(
			ActionSheetActionCreators as any,
			'openLazy',
			(args: any[]) => {
				try {
					const [sheet, key, props] = args
					if (typeof key === 'string') status.lastKey = key
					// Cleared first, so a sheet for something that is not a translatable message
					// never inherits the previous message's row.
					current = undefined

					const message = props?.message
					const text = textOf(message)
					const channelId = message?.channel_id ?? props?.channel?.id
					const messageId = typeof message?.id === 'string' ? message.id : ''

					if (
						typeof key === 'string' &&
						isMessageSheet(key) &&
						text &&
						messageId &&
						typeof channelId === 'string' &&
						sheet &&
						typeof sheet.then === 'function'
					) {
						debug(`sheet ${key}: ${text.length} characters to offer`)
						current = { channelId, messageId, text }
						// A *derived* promise, not a `.then` bolted onto theirs, so the component
						// `openLazy` receives cannot resolve before the row has been added.
						args[0] = sheet.then((mod: any) => patchSheetModule(mod, patches))
					}
				} catch (error) {
					console.error('[Translate] openLazy hook failed:', error)
				}

				// A before-hook must return the args array -- returning nothing sets args to
				// undefined for every later hook. Outside the try so it survives a throw above.
				return args
			},
		),
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
