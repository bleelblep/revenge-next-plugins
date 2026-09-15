import { DEFAULTS, type TimestampStorage } from "./lib/renderTimestamp"
import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"

export default plugin<{ jsonStorage: TimestampStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		const installTimer = setTimeout(() => {
			try {
				cleanup(patchRowManager(jsonStorage))
			} catch (error) {
				console.error("[CustomTimestamps] failed to patch RowManager:", error)
			}
		}, 0)
		cleanup(() => clearTimeout(installTimer))
	},
	SettingsComponent: Settings,
})
