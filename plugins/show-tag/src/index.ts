import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"

export interface ShowTagStorage {
	onlyUsername: boolean
}

/** Also the fallback for every read -- see the note in hide-call-buttons' DEFAULTS. */
export const DEFAULTS: ShowTagStorage = { onlyUsername: false }

export default plugin<{ jsonStorage: ShowTagStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		try {
			cleanup(patchRowManager(jsonStorage))
		} catch (error) {
			console.error("[ShowTag] failed to patch RowManager:", error)
		}
	},
	SettingsComponent: Settings,
})
