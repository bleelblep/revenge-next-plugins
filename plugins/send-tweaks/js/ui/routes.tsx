import Debug from './pages/Debug'
import Rules from './pages/Rules'
import TryIt from './pages/TryIt'

const PREFIX = 'bleelblep.send-tweaks'

export const RULES_ROUTE = `${PREFIX}.rules`
export const TRY_ROUTE = `${PREFIX}.try`
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
		route(RULES_ROUTE, 'Replacement rules', Rules),
		route(TRY_ROUTE, 'Try a message', TryIt),
		route(DEBUG_ROUTE, 'Debug', Debug),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
