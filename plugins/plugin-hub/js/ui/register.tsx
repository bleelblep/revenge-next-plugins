/**
 * The "Hub" and "AI Hub" rows, and the routes behind them.
 *
 * ## Where they go
 *
 * A "Plugin Hub" section of its own in Discord's settings, holding Hub, AI Hub, then Plugin Doctor
 * (`pages/Doctor.tsx`, `lib/doctor.ts`). Not added
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

import { problemCount } from '../lib/doctor'
import { aiCoreRunning, onPage } from '../lib/installed'
import { refreshSettingsUI } from '../lib/settingsUi'
import { getStorage, settings } from '../lib/state'
import { rowIcon } from './icon'
import Doctor from './pages/Doctor'
import DoctorPlugin, { selectedPluginName } from './pages/DoctorPlugin'
import { AiHub, default as Hub } from './pages/Hub'
import Manage from './pages/Manage'
import HubSettings, { AiHubSettings } from './pages/Settings'
import {
	AI_HUB_ROUTE,
	AI_SETTINGS_ROUTE,
	DOCTOR_PLUGIN_ROUTE,
	DOCTOR_ROUTE,
	HUB_ROUTE,
	MANAGE_ROUTE,
	placement,
	SETTINGS_ROUTE,
} from './routes'
import type { Entry } from '../types'

const SECTION = 'BLEELBLEP_HUB'
const SHORTCUTS_SECTION = 'BLEELBLEP_HUB_SHORTCUTS'

function countOf(ai: boolean) {
	const count = settings().entries.filter(entry => onPage(entry, ai)).length
	return count ? `${count}` : undefined
}

/** Route and settings key for one plugin's shortcut row. Distinct from the plugin's own route. */
const shortcutKey = (id: string) => `BleelblepHubPin.${id}`

/**
 * The screen behind a shortcut row: it hands straight over to the plugin's own settings page.
 *
 * Why not list the plugin's own settings item in our section instead: Revenge registers every
 * running plugin's settings page as an item keyed by its id (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/plugins.tsx`), but only while that plugin runs, and a
 * section naming a key that is not registered is spliced into Discord's list as-is -- there is no
 * public way to check first. Registering the same route name twice is no better: React Navigation
 * refuses duplicate screen names. So each shortcut is a route of our own whose screen `replace`s
 * itself with the plugin's route, and back goes straight to Settings.
 *
 * A plugin that is not running has no route to go to; the screen says so instead of going blank.
 */
function shortcutScreen(entry: Entry) {
	return function PluginHubShortcut({ navigation }: { navigation: any }) {
		const { React } = revenge.react
		const { Page } = revenge.components
		const { View } = revenge.react.ReactNative
		const { Text } = revenge.discord.design.Design

		const routeNames: string[] | undefined = navigation?.getState?.()?.routeNames
		// Unknown route list (an unexpected navigator): try anyway rather than refuse.
		const available = !Array.isArray(routeNames) || routeNames.includes(entry.id)

		React.useLayoutEffect(() => {
			if (!available) return
			try {
				if (typeof navigation.replace === 'function') navigation.replace(entry.id)
				else navigation.navigate(entry.id)
			} catch (error) {
				console.error(`[PluginHub] could not open ${entry.id}:`, error)
			}
		}, [])

		if (available) return null
		return (
			<Page>
				<View style={{ padding: 16 }}>
					<Text color="text-default" variant="text-md/semibold">
						{entry.name} is not running
					</Text>
					<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
						Its settings only exist while it runs. Turn it on under Revenge › Plugins, or
						remove this shortcut under Hub › Choose plugins.
					</Text>
				</View>
			</Page>
		)
	}
}

export function registerHub(): () => void {
	const S = revenge.discord.modules.settings
	const cleanups: Array<() => void> = []

	/** The shortcut rows and the section that lists them, rebuilt whenever the choice changes. */
	let shortcutCleanups: Array<() => void> = []
	let shownKeys = ''
	let installedOnce = false

	const installSection = () => {
		const shortcuts = settings().entries.filter(entry => entry.inSettings)
		// Only rebuild when the set or order of rows changed, not on every storage write.
		const signature = shortcuts.map(entry => `${entry.id}:${entry.name}:${entry.icon ?? ''}`).join('|')
		if (installedOnce && signature === shownKeys) return
		installedOnce = true
		shownKeys = signature

		for (const cleanup of shortcutCleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		shortcutCleanups = []

		const byName = [...shortcuts].sort((a, b) => a.name.localeCompare(b.name))
		for (const entry of byName) {
			const Screen = shortcutScreen(entry)
			shortcutCleanups.push(
				S.registerSettingsItem(shortcutKey(entry.id), {
					parent: null,
					type: 'route',
					IconComponent: () => rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon') ?? null,
					useTitle: () => entry.name,
					screen: { route: shortcutKey(entry.id), getComponent: () => Screen },
				} as any),
			)
		}

		// A section of its own, directly under Plugin Hub. Revenge splices indexed sections into
		// Discord's list in registration order, so index 2 registered after Plugin Hub's index 1
		// lands immediately below it -- and re-registering this one later keeps it there, since
		// Plugin Hub's own section is registered once and never moves. No section at all when
		// nothing is chosen, rather than an empty heading.
		if (byName.length) {
			shortcutCleanups.push(
				S.registerSettingsSection(SHORTCUTS_SECTION, {
					label: 'Shortcuts',
					settings: byName.map(entry => shortcutKey(entry.id)),
					index: 2,
				} as any),
			)
		}
		refreshSettingsUI()
	}

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
			// Plugin Doctor. Hidden until unlocked from Hub settings (seven taps on the version row),
			// like Android's developer options. The trailing count is from the last checkup this
			// session, so it is blank until the page has been opened once -- a checkup fetches every
			// repository's index, which is not something to do just because Settings was opened.
			S.registerSettingsItem(DOCTOR_ROUTE, {
				parent: null,
				type: 'route',
				IconComponent: () => rowIcon('WrenchIcon', 'BugIcon') ?? null,
				useTitle: () => 'Plugin Doctor',
				usePredicate: () => !!settings().doctorUnlocked,
				useTrailing: () => {
					const count = problemCount()
					return count ? `${count}` : undefined
				},
				screen: { route: DOCTOR_ROUTE, getComponent: () => Doctor },
			} as any),
			// One plugin's details, opened from the Doctor; in no section.
			S.registerSettingsItem(DOCTOR_PLUGIN_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => selectedPluginName(),
				screen: { route: DOCTOR_PLUGIN_ROUTE, getComponent: () => DoctorPlugin },
			} as any),
			S.registerSettingsItem(MANAGE_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Choose plugins',
				screen: { route: MANAGE_ROUTE, getComponent: () => Manage },
			} as any),
			// Opened from the settings icon at the top right of each page; in no section.
			S.registerSettingsItem(SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Hub settings',
				screen: { route: SETTINGS_ROUTE, getComponent: () => HubSettings },
			} as any),
			S.registerSettingsItem(AI_SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'AI Hub settings',
				screen: { route: AI_SETTINGS_ROUTE, getComponent: () => AiHubSettings },
			} as any),
		)

		cleanups.push(
			S.registerSettingsSection(SECTION, {
				label: 'Plugin Hub',
				settings: [HUB_ROUTE, AI_HUB_ROUTE, DOCTOR_ROUTE],
				index: 1,
			} as any),
		)

		// The Shortcuts section under it: a row for each plugin chosen to appear there. Rebuilt when
		// the choice changes, so switching one on under Choose plugins shows up without a restart.
		installSection()
		const storage = getStorage()
		if (storage) cleanups.push(storage.subscribe(() => installSection()))
		cleanups.push(() => {
			for (const cleanup of shortcutCleanups.reverse()) {
				try {
					cleanup()
				} catch {
					/* already gone */
				}
			}
			shortcutCleanups = []
			shownKeys = ''
			installedOnce = false
		})
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
