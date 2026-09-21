import Debug from './pages/Debug'
import Options from './pages/Options'

const PREFIX = 'bleelblep.catch-up'

export const OPTIONS_ROUTE = `${PREFIX}.options`
export const DEBUG_ROUTE = `${PREFIX}.debug`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. Which exists depends on the bundle the user is running, so call
 * whichever is actually there.
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

	const unregister = [
		registerSettingsItem(OPTIONS_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Settings',
			screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
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
