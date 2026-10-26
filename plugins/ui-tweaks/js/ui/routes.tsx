import SettingsItemsPage from './SettingsItemsPage'
import SheetPage from './SheetPage'
import SwipePage from './SwipePage'
import * as modulesSettings from '@revenge-mod/discord/modules/settings'

const PREFIX = 'bleelblep.ui-tweaks'

export const SHEET_ROUTE = `${PREFIX}.sheet`
export const SETTINGS_ROUTE = `${PREFIX}.settings`
export const SWIPE_ROUTE = `${PREFIX}.swipe`

/** Whichever refresh this Revenge build has (see ai-core/js/ui/routes.tsx). */
function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/** The two sub-pages, reached from the plugin's settings. Registered once settings modules load. */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(SHEET_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Long-press menu',
				screen: { route: SHEET_ROUTE, getComponent: () => SheetPage },
			} as any),
			registerSettingsItem(SETTINGS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Discord settings',
				screen: { route: SETTINGS_ROUTE, getComponent: () => SettingsItemsPage },
			} as any),
			registerSettingsItem(SWIPE_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Swipe actions',
				screen: { route: SWIPE_ROUTE, getComponent: () => SwipePage },
			} as any),
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
