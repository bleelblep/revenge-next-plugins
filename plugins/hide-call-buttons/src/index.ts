import patchCallButtons from "./patches/callButtons"
import Settings from "./ui/pages/Settings"

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
	start({ cleanup, jsonStorage }) {
		try {
			cleanup(patchCallButtons(jsonStorage))
		} catch (error) {
			console.error("[HideCallButtons] failed to apply patches:", error)
		}
	},
	SettingsComponent: Settings,
})
