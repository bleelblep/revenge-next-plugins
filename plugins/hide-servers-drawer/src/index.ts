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
}

export default plugin<HideServersDrawerStorage>({
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
