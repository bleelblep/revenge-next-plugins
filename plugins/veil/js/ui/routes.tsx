import Appearance from './pages/Appearance'
import Category from './pages/Category'
import Debug from './pages/Debug'
import Rules from './pages/Rules'
import Words from './pages/Words'

const PREFIX = 'bleelblep.veil'

export const WORDS_ROUTE = `${PREFIX}.words`
export const CATEGORY_ROUTE = `${PREFIX}.category`
export const RULES_ROUTE = `${PREFIX}.rules`
export const APPEARANCE_ROUTE = `${PREFIX}.appearance`
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
			page(WORDS_ROUTE, 'Words', Words),
			page(CATEGORY_ROUTE, 'Your own category', Category),
			page(RULES_ROUTE, 'People and channels', Rules),
			page(APPEARANCE_ROUTE, 'How it looks', Appearance),
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
