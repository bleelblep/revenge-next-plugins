import Log from './pages/Log'
import Options from './pages/Options'
import Visuals from './pages/Visuals'
import Backup from './pages/Backup'
import License from './pages/License'
import Debug from './pages/Debug'

const PREFIX = 'bleelblep.ghost-log-native-beta'

export const LOG_ROUTE = `${PREFIX}.log`
export const OPTIONS_ROUTE = `${PREFIX}.options`
export const VISUALS_ROUTE = `${PREFIX}.visuals`
export const BACKUP_ROUTE = `${PREFIX}.backup`
export const LICENSE_ROUTE = `${PREFIX}.license`
export const DEBUG_ROUTE = `${PREFIX}.debug`

function refreshSettingsUI() {
	const settings = revenge.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings

	const unregister = [
		registerSettingsItem(LOG_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Deleted messages',
			screen: { route: LOG_ROUTE, getComponent: () => Log },
		}),
		registerSettingsItem(OPTIONS_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Settings',
			screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
		}),
		registerSettingsItem(VISUALS_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Visual style',
			screen: { route: VISUALS_ROUTE, getComponent: () => Visuals },
		}),
		registerSettingsItem(BACKUP_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Backup',
			screen: { route: BACKUP_ROUTE, getComponent: () => Backup },
		}),
		registerSettingsItem(LICENSE_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Licence',
			screen: { route: LICENSE_ROUTE, getComponent: () => License },
		}),
		registerSettingsItem(DEBUG_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Debug',
			screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
