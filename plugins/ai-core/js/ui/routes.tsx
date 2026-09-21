import Debug from './pages/Debug'
import Provider from './pages/Provider'
import Usage from './pages/Usage'

const PREFIX = 'bleelblep.ai-core'

export const PROVIDER_ROUTE = `${PREFIX}.provider`
export const USAGE_ROUTE = `${PREFIX}.usage`
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
		registerSettingsItem(PROVIDER_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Provider',
			screen: { route: PROVIDER_ROUTE, getComponent: () => Provider },
		}),
		registerSettingsItem(USAGE_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Usage and limits',
			screen: { route: USAGE_ROUTE, getComponent: () => Usage },
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
