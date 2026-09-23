import { DEFAULTS, type TimestampStorage } from "./lib/renderTimestamp"
import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"

export default plugin<{ jsonStorage: TimestampStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Enabling a plugin mid-session leaves its hooks half-applied -- Discord modules it patches
		// may already be initialized and its settings routes are registered too late for the
		// settings screen. Ask for a reload instead of running in a state we cannot verify.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		const installTimer = setTimeout(() => {
			try {
				cleanup(patchRowManager(jsonStorage))
			} catch (error) {
				console.error("[CustomTimestamps] failed to patch RowManager:", error)
			}
		}, 0)
		cleanup(() => clearTimeout(installTimer))
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
