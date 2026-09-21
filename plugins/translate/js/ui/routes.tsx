import Appearance from './pages/Appearance'
import Debug from './pages/Debug'
import Language from './pages/Language'
import Service from './pages/Service'

const PREFIX = 'bleelblep.translate'

export const LANGUAGE_ROUTE = `${PREFIX}.language`
export const SERVICE_ROUTE = `${PREFIX}.service`
export const APPEARANCE_ROUTE = `${PREFIX}.appearance`
export const DEBUG_ROUTE = `${PREFIX}.debug`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. Which exists depends on the bundle the user is running.
 */
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

	const route = (key: string, title: string, component: any) =>
		registerSettingsItem(key, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route: key, getComponent: () => component },
		})

	const unregister = [
		route(LANGUAGE_ROUTE, 'Translate into', Language),
		route(SERVICE_ROUTE, 'Service', Service),
		route(APPEARANCE_ROUTE, 'Appearance', Appearance),
		route(DEBUG_ROUTE, 'Debug', Debug),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
