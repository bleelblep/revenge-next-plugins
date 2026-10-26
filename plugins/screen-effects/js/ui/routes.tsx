import Debug from "./pages/Debug"
import Effect from "./pages/Effect"
import Filter from "./pages/Filter"
import License from "./pages/License"
import MessageEffects from "./pages/MessageEffects"
import Particles from "./pages/Particles"
import PowerMode from "./pages/PowerMode"
import Settings from "./pages/Settings"
import Triggers from "./pages/Triggers"
import * as modulesSettings from "@revenge-mod/discord/modules/settings"

const DEBUG: boolean = false

const PREFIX = "bleelblep.screen-effects"

export const EFFECT_ROUTE = `${PREFIX}.effect`
export const PARTICLES_ROUTE = `${PREFIX}.particles`
export const TRIGGERS_ROUTE = `${PREFIX}.triggers`
export const FILTER_ROUTE = `${PREFIX}.filter`
export const POWER_ROUTE = `${PREFIX}.power`
export const MESSAGE_FX_ROUTE = `${PREFIX}.message-effects`
export const LICENSE_ROUTE = `${PREFIX}.license`
export const DEBUG_ROUTE = `${PREFIX}.debug`

const PAGES: [route: string, title: string, component: () => any][] = [
	[EFFECT_ROUTE, "Screen effect", Effect],
	[PARTICLES_ROUTE, "Particles", Particles],
	[TRIGGERS_ROUTE, "When effects play", Triggers],
	[FILTER_ROUTE, "Screen filter", Filter],
	[POWER_ROUTE, "Power mode", PowerMode],
	[MESSAGE_FX_ROUTE, "Message effects", MessageEffects],
	...(DEBUG ? [[DEBUG_ROUTE, "Debug", Debug] as [string, string, () => any]] : []),
	[LICENSE_ROUTE, "Licence", License],
]

function refreshSettingsUI() {
	const settings = modulesSettings as any
	if (typeof settings.refreshSettings === "function") {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

/** Same registration as ghost-log-native-beta's ui/routes.tsx. */
export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = modulesSettings

	// Inside `onSettingsModulesLoaded`: it fires at once when Discord's settings modules are already
	// loaded and waits when they are not. Registering before they exist leaves the pages missing.
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = PAGES.map(([route, title, component]) =>
			registerSettingsItem(route, {
				parent: null,
				type: "route",
				useTitle: () => title,
				screen: { route, getComponent: () => component },
			}),
		)
		// The gear on the VFX card navigates to a route named after the plugin id, which Revenge
		// registers once start() has finished. On some phones (Android 16 reports) that route never
		// reached the navigator: the gear did nothing while these pages worked. Registering it here
		// too, in the same batch as the pages, guarantees it. Same key, so whichever lands last wins,
		// and both open this page. `Settings` is read when the route opens, not now: it imports this
		// file, so at module load it may not be defined yet.
		unregister.push(
			registerSettingsItem(PREFIX, {
				parent: null,
				type: "route",
				useTitle: () => "VFX",
				screen: { route: PREFIX, getComponent: () => Settings },
			}),
		)
		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
