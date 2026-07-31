import Log from "./pages/Log"
import Options from "./pages/Options"

const PREFIX = "bleelblep.relationship-notifier"

export const LOG_ROUTE = `${PREFIX}.log`
export const OPTIONS_ROUTE = `${PREFIX}.options`

/**
 * Upstream commit 10371ff merged `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * into `refreshSettings`. The vendored types still describe the older pair, and which exists
 * depends on the bundle the user is running, so call whichever is actually there.
 */
function refreshSettingsUI() {
	const settings = revenge.discord.modules.settings as any
	if (typeof settings.refreshSettings === "function") {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings

	const unregister = [
		registerSettingsItem(LOG_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "History",
			screen: { route: LOG_ROUTE, getComponent: () => Log },
		}),
		registerSettingsItem(OPTIONS_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Settings",
			screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
