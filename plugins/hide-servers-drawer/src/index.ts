import { init as initHidden } from "./lib/hidden"
import { initPrefs } from "./lib/prefs"
import { patchCreateElement } from "./patches/createElementIntercept"
import patchGuildsBar from "./patches/guildsBar"
import patchSortedGuilds, { refresh } from "./patches/sortedGuilds"
import Settings from "./ui/pages/Settings"

export interface HideServersDrawerStorage {
	hidden?: Record<string, true>
	instant?: boolean
	staticIcons?: boolean
	/**
	 * Show the most recent DM's avatar on the Home button instead of a static icon.
	 *
	 * This plugin originally did that unconditionally, on the belief that it was mimicking
	 * stock. It isn't what stock does here, so it is now off by default and opt-in.
	 */
	dmAvatarHome?: boolean
}

export default plugin<{ jsonStorage: HideServersDrawerStorage }>({
	jsonStorage: {
		load: true,
		default: {},
	},
	start({ cleanup, jsonStorage }) {
		initHidden(jsonStorage)
		initPrefs(jsonStorage)

		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[HideServersDrawer] failed to apply ${name}:`, error)
			}
		}

		// Order doesn't matter for correctness (registerIntercept just writes to a map that
		// the patched React.createElement reads lazily), but enabling the intercept mechanism
		// before anything registers against it keeps the sequence readable.
		try {
			const patches: Array<() => void> = []
			patchCreateElement(patches)
			patches.forEach(unpatch => cleanup(unpatch))
		} catch (error) {
			console.error("[HideServersDrawer] failed to apply createElement intercept:", error)
		}

		// Two layers: the store filter keeps derived data consistent (used by the custom bar
		// and by anything else that reads SortedGuildStore), and the guildsBar patch is what
		// actually swaps in the non-virtualized bar when something is hidden.
		apply("sortedGuilds", patchSortedGuilds)
		apply("guildsBar", patchGuildsBar)
		refresh()

		cleanup(() => refresh())
	},
	SettingsComponent: Settings,
})
