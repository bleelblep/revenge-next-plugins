import patchCallButtons from "./patches/callButtons"
import Settings from "./ui/pages/Settings"
import { CHANGELOG } from "./changelog"
import { setupChangelog } from "../../../shared/changelog"

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 */
export const DEFAULTS: HideCallButtonsStorage = {
	upHideVoiceButton: true,
	upHideVideoButton: true,
	dmHideCallButton: false,
	dmHideVideoButton: false,
	hideVCVideoButton: false,
}

export interface HideCallButtonsStorage {
	upHideVoiceButton: boolean
	upHideVideoButton: boolean
	dmHideCallButton: boolean
	dmHideVideoButton: boolean
	hideVCVideoButton: boolean
}

export default plugin<{ jsonStorage: HideCallButtonsStorage }>({
	jsonStorage: {
		load: true,
		// Same defaults as the original: profile buttons hidden, DM and VC buttons kept.
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

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))

		const installTimer = setTimeout(() => {
			try {
				cleanup(patchCallButtons(jsonStorage))
			} catch (error) {
				console.error("[HideCallButtons] failed to apply patches:", error)
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
