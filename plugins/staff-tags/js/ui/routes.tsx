import IconPicker from './pages/IconPicker'
import TagEditor from './pages/TagEditor'

const PREFIX = 'bleelblep.staff-tags'

export const TAG_ROUTE = `${PREFIX}.tag`
export const ICONS_ROUTE = `${PREFIX}.icons`

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
		unregister = [page(TAG_ROUTE, 'Tag', TagEditor), page(ICONS_ROUTE, 'Icon', IconPicker)]

		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
