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
	const { registerSettingsItem, onSettingsModulesLoaded } =
		revenge.discord.modules.settings

	const route = (key: string, title: string, component: any) =>
		registerSettingsItem(key, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route: key, getComponent: () => component },
		})

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			route(RULES_ROUTE, 'Replacement rules', Rules),
			route(TRY_ROUTE, 'Try a message', TryIt),
			route(DEBUG_ROUTE, 'Debug', Debug),
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
