import Log from "./pages/Log"
import Options from "./pages/Options"
import Visuals from "./pages/Visuals"
import License from "./pages/License"

const PREFIX = "bleelblep.ghost-log"

export const LOG_ROUTE = `${PREFIX}.log`
export const OPTIONS_ROUTE = `${PREFIX}.options`
export const VISUALS_ROUTE = `${PREFIX}.visuals`
export const LICENSE_ROUTE = `${PREFIX}.license`

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
			useTitle: () => "Deleted messages",
			screen: { route: LOG_ROUTE, getComponent: () => Log },
		}),
		registerSettingsItem(OPTIONS_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Settings",
			screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
		}),
		registerSettingsItem(VISUALS_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Visual style",
			screen: { route: VISUALS_ROUTE, getComponent: () => Visuals },
		}),
		registerSettingsItem(LICENSE_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Licence",
			screen: { route: LICENSE_ROUTE, getComponent: () => License },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
