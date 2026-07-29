import type { TimestampStorage } from "./lib/renderTimestamp"
import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"

export default plugin<TimestampStorage>({
	jsonStorage: {
		load: true,
		default: {
			selected: "calendar",
			customFormat: "dddd, MMMM Do YYYY, h:mm:ss a",
		},
	},
	start({ cleanup, jsonStorage }) {
		try {
			cleanup(patchRowManager(jsonStorage))
		} catch (error) {
			console.error("[CustomTimestamps] failed to patch RowManager:", error)
		}
	},
	SettingsComponent: Settings,
})
