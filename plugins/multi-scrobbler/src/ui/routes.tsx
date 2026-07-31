import Diagnostics from "./pages/sub/Diagnostics"
import Display from "./pages/sub/Display"
import IgnoreList from "./pages/sub/IgnoreList"
import LastFm from "./pages/sub/LastFm"
import LibreFm from "./pages/sub/LibreFm"
import ListenBrainz from "./pages/sub/ListenBrainz"
import Logging from "./pages/sub/Logging"
import RpcCustomization from "./pages/sub/RpcCustomization"

const PREFIX = "bleelblep.multi-scrobbler"

/**
 * Sub-pages are registered as real settings routes rather than swapped in with component state,
 * so the Android back button walks back through them the way it does everywhere else in Discord.
 * This mirrors how Revenge registers its own Plugins -> Advanced screen: `parent: null`, and the
 * parent page navigates explicitly by route name.
 */
export interface SubPage {
	key: string
	route: string
	title: string
	subtitle: string
	icon?: string
	component: () => any
	/** Hides service pages that aren't the selected one. */
	onlyForService?: "lastfm" | "librefm" | "listenbrainz"
}

export const SUB_PAGES: SubPage[] = [
	{
		key: `${PREFIX}.lastfm`,
		route: `${PREFIX}.lastfm`,
		title: "Last.fm",
		subtitle: "Username and API key",
		component: () => LastFm,
		onlyForService: "lastfm",
	},
	{
		key: `${PREFIX}.librefm`,
		route: `${PREFIX}.librefm`,
		title: "Libre.fm",
		subtitle: "Username and API key",
		component: () => LibreFm,
		onlyForService: "librefm",
	},
	{
		key: `${PREFIX}.listenbrainz`,
		route: `${PREFIX}.listenbrainz`,
		title: "ListenBrainz",
		subtitle: "Username and optional token",
		component: () => ListenBrainz,
		onlyForService: "listenbrainz",
	},
	{
		key: `${PREFIX}.display`,
		route: `${PREFIX}.display`,
		title: "Display",
		subtitle: "Activity type and timestamps",
		icon: "EyeSlashIcon",
		component: () => Display,
	},
	{
		key: `${PREFIX}.rpc`,
		route: `${PREFIX}.rpc`,
		title: "RPC customisation",
		subtitle: "Activity name and tooltip",
		icon: "NitroWheelIcon",
		component: () => RpcCustomization,
	},
	{
		key: `${PREFIX}.ignore`,
		route: `${PREFIX}.ignore`,
		title: "Ignore list",
		subtitle: "Apps that take priority over this plugin",
		icon: "DenyIcon",
		component: () => IgnoreList,
	},
	{
		key: `${PREFIX}.logging`,
		route: `${PREFIX}.logging`,
		title: "Logging",
		subtitle: "Verbose output for debugging",
		icon: "KeyboardIcon",
		component: () => Logging,
	},
	{
		key: `${PREFIX}.diagnostics`,
		route: `${PREFIX}.diagnostics`,
		title: "Diagnostics",
		subtitle: "Live state, no debugger required",
		icon: "CircleCheckIcon",
		component: () => Diagnostics,
	},
]

/**
 * Upstream commit 10371ff replaced `refreshSettingsNavigator` + `refreshSettingsOverviewScreen`
 * with a single `refreshSettings`. The vendored types still describe the older pair, and we don't
 * know which bundle a given user is on, so call whichever actually exists.
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

/** Registers every sub-page route. Returns an unregister for the plugin's cleanup list. */
export function registerSubPages(): () => void {
	const { registerSettingsItem } = revenge.discord.modules.settings
	const { TableRowAssetIcon } = revenge.components

	const unregister = SUB_PAGES.map(page =>
		registerSettingsItem(page.key, {
			parent: null,
			type: "route",
			IconComponent: page.icon ? () => <TableRowAssetIcon name={page.icon!} /> : undefined,
			useTitle: () => page.title,
			screen: {
				route: page.route,
				getComponent: () => page.component(),
			},
		}),
	)

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
