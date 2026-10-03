/**
 * No Dividers -- takes out the lines between rows.
 *
 * Every Discord table (settings pages, and the other grouped lists built from TableRowGroup) draws
 * the line between two rows with `TableRowDivider`, exported on its own by a small module (6080 on
 * 349.1, next to the `TABLE_DIVIDER_WIDTH` constants). Callers read the export when they render,
 * so replacing it with a component that draws nothing removes every one of those lines; putting
 * Discord's back restores them. Screens already on screen change when they next redraw.
 *
 * Found live on 349.1: setting `TABLE_DIVIDER_WIDTH` to 0, or making BORDER_SUBTLE / BORDER_MUTED
 * transparent, left the lines in place; replacing `TableRowDivider` removed them.
 */

import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import Settings from './ui/Settings'

const EXPORT = 'TableRowDivider'

function NoDivider() {
	return null
}

export default plugin({
	// Only for the changelog's last-seen version (shared/changelog.tsx).
	jsonStorage: { load: true, default: {} },
	start({ cleanup, jsonStorage, plugin }) {
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		let host: any
		let original: unknown

		const install = (exports: any) => {
			const target =
				typeof exports?.[EXPORT] === 'function' ? exports : exports?.default
			if (
				typeof target?.[EXPORT] !== 'function' ||
				target[EXPORT] === NoDivider
			)
				return
			host = target
			original = target[EXPORT]
			target[EXPORT] = NoDivider
		}

		const { getModules } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		// One module has this export; max 1 so the lookup and the wait for it share nothing else
		// (a broad filter can spend `max` on the lookup and never subscribe).
		const unsubscribe = getModules(
			withProps(EXPORT),
			(exports: any) => {
				try {
					install(exports)
				} catch (error) {
					console.error('[NoDividers] could not replace the divider:', error)
				}
			},
			{ max: 1 },
		)

		cleanup(() => {
			unsubscribe?.()
			// Only put Discord's back if nobody has replaced ours since.
			if (host && host[EXPORT] === NoDivider) host[EXPORT] = original
		})
	},
	SettingsComponent: Settings,
})
