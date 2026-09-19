import Debug from "./pages/Debug"
import Visuals from "./pages/Visuals"

const PREFIX = "bleelblep.screenshot-redactor"

export const VISUALS_ROUTE = `${PREFIX}.visuals`
export const DEBUG_ROUTE = `${PREFIX}.debug`

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

/**
 * The visual options and the debug tools each live on their own navigator route, leaving the
 * root page as the toggle, the warnings and a two-row index. Inline, the diagnostics wall of
 * text swamped everything else on the page. Same split as anti-ghost-ping.
 */
export function registerPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings

	const unregister = [
		registerSettingsItem(VISUALS_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Visual style",
			screen: { route: VISUALS_ROUTE, getComponent: () => Visuals },
		}),
		registerSettingsItem(DEBUG_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Debug",
			screen: { route: DEBUG_ROUTE, getComponent: () => Debug },
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
