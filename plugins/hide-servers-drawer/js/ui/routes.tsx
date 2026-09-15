import Debug from "./pages/Debug"
import Servers from "./pages/Servers"

const PREFIX = "bleelblep.hide-servers-drawer"

export const SERVERS_ROUTE = `${PREFIX}.servers`
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
 * The server list and the debug tools (which include the legacy custom bar) each live on
 * their own navigator route, leaving the root page as a short index -- same split as
 * screenshot-redactor-dev and anti-ghost-ping.
 */
export function registerPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings

	const unregister = [
		registerSettingsItem(SERVERS_ROUTE, {
			parent: null,
			type: "route",
			useTitle: () => "Servers",
			screen: { route: SERVERS_ROUTE, getComponent: () => Servers },
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
