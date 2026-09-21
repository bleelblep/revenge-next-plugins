import Checks from './pages/Checks'
import Debug from './pages/Debug'
import Privacy from './pages/Privacy'
import TryDraft from './pages/TryDraft'

const PREFIX = 'bleelblep.second-thoughts'

export const CHECKS_ROUTE = `${PREFIX}.checks`
export const TRY_ROUTE = `${PREFIX}.try`
export const PRIVACY_ROUTE = `${PREFIX}.privacy`
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
		registerSettingsItem(CHECKS_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Checks',
			screen: { route: CHECKS_ROUTE, getComponent: () => Checks },
		}),
		registerSettingsItem(TRY_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Try a draft',
			screen: { route: TRY_ROUTE, getComponent: () => TryDraft },
		}),
		registerSettingsItem(PRIVACY_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'What leaves the device',
			screen: { route: PRIVACY_ROUTE, getComponent: () => Privacy },
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
