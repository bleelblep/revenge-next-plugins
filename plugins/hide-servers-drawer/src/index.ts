import { init as initHidden } from "./lib/hidden"
import { initPrefs } from "./lib/prefs"
import { patchCreateElement } from "./patches/createElementIntercept"
import patchGuildsBar from "./patches/guildsBar"
import patchSortedGuilds, { refresh } from "./patches/sortedGuilds"

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
	// SettingsComponent intentionally omitted: confirmed on-device, twice, that registering
	// it crashes Discord's entire Settings screen on open (not just this plugin's page) --
	// "Invariant Violation: Setting <id> is missing a title", thrown from Discord's own
	// getSettingTitle during useDescriptors for the whole Settings navigator. The wiring
	// Revenge Next uses to register this (useTitle: () => plugin.manifest.name) matches its
	// real source exactly (checked against revenge-mod/revenge-bundle-next main, both before
	// and after the 2026-07-25 plugin-system rewrite -- identical in both), and no one else
	// has reported this upstream, so the exact root cause is unconfirmed. Until it's
	// understood, a plugin must never be able to take down the whole Settings screen.
})
