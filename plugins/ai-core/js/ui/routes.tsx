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
	const { registerSettingsItem, onSettingsModulesLoaded } =
		revenge.discord.modules.settings

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
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
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
