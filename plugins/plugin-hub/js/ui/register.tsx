/**
 * The "Plugin Hub" row, and the routes behind it.
 *
 * ## Where it goes
 *
 * Revenge's own section in Discord's settings is keyed `REVENGE` and holds `Revenge` then
 * `RevengePlugins` -- the Plugins entry adds itself at index 1 with
 * `addSettingsItemToSection('REVENGE', 'RevengePlugins', 1)` (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/register.tsx`). Appending with no index puts this row at the
 * end of that section, which with nothing else added is directly below Plugins.
 *
 * Revenge's Plugins entry can rely on the section existing because it depends on the plugin that
 * registers it. An external plugin cannot, so if adding to `REVENGE` throws, the row gets a small
 * section of its own instead rather than not appearing at all.
 *
 * ## The row itself
 *
 * Same shape as Revenge's Plugins row -- `parent: null`, `IconComponent`, `useTitle`,
 * `useTrailing` -- so it sits in the list looking like it belongs there.
 */

import { settings } from '../lib/state'
import { rowIcon } from './icon'
import Hub from './pages/Hub'
import Manage from './pages/Manage'
import { HUB_ROUTE, MANAGE_ROUTE, placement } from './routes'

const FALLBACK_SECTION = 'BLEELBLEP_HUB'

function refreshSettingsUI() {
	const S = revenge.discord.modules.settings as any
	if (typeof S.refreshSettings === 'function') {
		S.refreshSettings()
		return
	}
	S.refreshSettingsNavigator?.()
	S.refreshSettingsOverviewScreen?.()
}

export function registerHub(): () => void {
	const S = revenge.discord.modules.settings
	const cleanups: Array<() => void> = []

	const install = () => {
		cleanups.push(
			S.registerSettingsItem(HUB_ROUTE, {
				parent: null,
				type: 'route',
				IconComponent: () => rowIcon('AppsIcon', 'GridSquareIcon') ?? null,
				useTitle: () => 'Plugin Hub',
				useTrailing: () => {
					const count = settings().entries.length
					return count ? `${count}` : undefined
				},
				screen: { route: HUB_ROUTE, getComponent: () => Hub },
			} as any),
			S.registerSettingsItem(MANAGE_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Choose plugins',
				screen: { route: MANAGE_ROUTE, getComponent: () => Manage },
			} as any),
		)

		try {
			cleanups.push(S.addSettingsItemToSection('REVENGE', HUB_ROUTE))
			placement.where = "under Revenge's Plugins"
		} catch (error) {
			console.log(
				"[PluginHub] Revenge's settings section was not there; using a section of its own",
				error,
			)
			cleanups.push(
				S.registerSettingsSection(FALLBACK_SECTION, {
					label: 'Plugin Hub',
					settings: [HUB_ROUTE],
				} as any),
			)
			placement.where = 'in a section of its own'
		}

		console.log(`[PluginHub] Plugin Hub row registered ${placement.where}`)
		refreshSettingsUI()
	}

	// Registered once Discord's settings modules exist, the documented moment for it.
	cleanups.push(S.onSettingsModulesLoaded(install))

	return () => {
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		placement.where = 'not yet registered'
		refreshSettingsUI()
	}
}
