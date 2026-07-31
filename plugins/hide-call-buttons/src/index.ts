import patchCallButtons from "./patches/callButtons"
import Settings from "./ui/pages/Settings"

export interface HideCallButtonsStorage {
	upHideVoiceButton: boolean
	upHideVideoButton: boolean
	dmHideCallButton: boolean
	dmHideVideoButton: boolean
	hideVCVideoButton: boolean
}

export default plugin<HideCallButtonsStorage>({
	jsonStorage: {
		load: true,
		// Same defaults as the original: profile buttons hidden, DM and VC buttons kept.
		default: {
			upHideVoiceButton: true,
			upHideVideoButton: true,
			dmHideCallButton: false,
			dmHideVideoButton: false,
			hideVCVideoButton: false,
		},
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
