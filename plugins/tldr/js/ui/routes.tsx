import Debug from './pages/Debug'
import Saved from './pages/Saved'
import WhenToOffer from './pages/WhenToOffer'

const PREFIX = 'bleelblep.tldr'

export const OFFER_ROUTE = `${PREFIX}.offer`
export const SAVED_ROUTE = `${PREFIX}.saved`
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

	const page = (route: string, title: string, component: any) =>
		registerSettingsItem(route, {
			parent: null,
			type: 'route',
			useTitle: () => title,
			screen: { route, getComponent: () => component },
		})

	// Registered inside `onSettingsModulesLoaded`: it fires immediately when Discord's
	// settings modules are already loaded, and waits when they are not. Registering
	// before they exist is how a page ends up missing until the app is restarted.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			page(OFFER_ROUTE, 'When to offer it', WhenToOffer),
			page(SAVED_ROUTE, 'Saved summaries', Saved),
			page(DEBUG_ROUTE, 'Debug', Debug),
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
