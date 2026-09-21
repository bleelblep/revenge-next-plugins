/**
 * The "Hub" and "AI Hub" rows, and the routes behind them.
 *
 * ## Where they go
 *
 * A "Plugin Hub" section of its own in Discord's settings, holding Hub and then AI Hub. Not added
 * to Revenge's `REVENGE` section: on Discord 348 that call started succeeding and quietly folded
 * the rows in under Revenge's Plugins, which is not where people look for them.
 *
 * `index: 1` puts the section directly below Revenge's. Revenge splices each registered section
 * into Discord's list at its `index`, and `unshift`s any without one -- in registration order, so
 * an unindexed section registered after Revenge's ends up *above* it (revenge-bundle-next,
 * `src/plugins/start/settings/index.ts`). Index 0 would not work either: it is falsy there.
 *
 * ## AI Hub
 *
 * AI Core and the plugins that use it are listed on their own page, as plain rows, rather than
 * on the Hub. The row is always registered but its `usePredicate` hides it unless AI Core is running
 * (`aiCoreRunning` in `lib/installed.ts`), so installing or removing AI Core needs no restart of
 * this plugin -- only a fresh look at the settings screen.
 *
 * ## The rows themselves
 *
 * Same shape as Revenge's Plugins row -- `parent: null`, `IconComponent`, `useTitle`,
 * `useTrailing` -- so they sit in the list looking like they belong there.
 */

import { aiCoreRunning, usesAiCore } from '../lib/installed'
import { settings } from '../lib/state'
import { rowIcon } from './icon'
import { AiHub, default as Hub } from './pages/Hub'
import Manage from './pages/Manage'
import { AI_HUB_ROUTE, HUB_ROUTE, MANAGE_ROUTE, placement } from './routes'

const SECTION = 'BLEELBLEP_HUB'

function refreshSettingsUI() {
	const S = revenge.discord.modules.settings as any
	if (typeof S.refreshSettings === 'function') {
		S.refreshSettings()
		return
	}
	S.refreshSettingsNavigator?.()
	S.refreshSettingsOverviewScreen?.()
}

function countOf(ai: boolean) {
	const count = settings().entries.filter(entry => usesAiCore(entry) === ai).length
	return count ? `${count}` : undefined
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
				useTitle: () => 'Hub',
				useTrailing: () => countOf(false),
				screen: { route: HUB_ROUTE, getComponent: () => Hub },
			} as any),
			S.registerSettingsItem(AI_HUB_ROUTE, {
				parent: null,
				type: 'route',
				IconComponent: () => rowIcon('MagicWandIcon') ?? null,
				useTitle: () => 'AI Hub',
				useTrailing: () => countOf(true),
				usePredicate: () => aiCoreRunning(),
				screen: { route: AI_HUB_ROUTE, getComponent: () => AiHub },
			} as any),
			S.registerSettingsItem(MANAGE_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Choose plugins',
				screen: { route: MANAGE_ROUTE, getComponent: () => Manage },
			} as any),
		)

		cleanups.push(
			S.registerSettingsSection(SECTION, {
				label: 'Plugin Hub',
				settings: [HUB_ROUTE, AI_HUB_ROUTE],
				index: 1,
			} as any),
		)
		placement.where = 'in the Plugin Hub section'

		console.log(`[PluginHub] Hub rows registered ${placement.where}`)
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
