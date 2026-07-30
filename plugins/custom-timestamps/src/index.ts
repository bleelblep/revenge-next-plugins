import type { TimestampStorage } from "./lib/renderTimestamp"
import patchRowManager from "./patches/rowManager"

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
	// SettingsComponent intentionally omitted: confirmed on-device (twice, on two different
	// plugins) that registering it crashes Discord's entire Settings screen on open, not just
	// this plugin's own page -- "Invariant Violation: Setting <id> is missing a title", from
	// Discord's own getSettingTitle during useDescriptors for the whole Settings navigator.
	// Root cause unconfirmed (Revenge Next's wiring for this matches its real source exactly).
	// Mode stays at its jsonStorage default ("calendar") until this is understood.
})
