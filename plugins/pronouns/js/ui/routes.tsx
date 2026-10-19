import * as modulesSettings from '@revenge-mod/discord/modules/settings'
import BadgeColor from './pages/BadgeColor'
import People from './pages/People'
import Sources from './pages/Sources'

const PREFIX = 'bleelblep.pronouns'

export const PEOPLE_ROUTE = `${PREFIX}.people`
export const SOURCES_ROUTE = `${PREFIX}.sources`
export const BADGE_COLOR_ROUTE = `${PREFIX}.badge-color`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. Which exists depends on the bundle the user is running, so call
 * whichever is actually there.
 */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

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
			page(PEOPLE_ROUTE, 'People', People),
			page(SOURCES_ROUTE, 'Pronoun sources', Sources),
			page(BADGE_COLOR_ROUTE, 'Badge colour', BadgeColor),
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
