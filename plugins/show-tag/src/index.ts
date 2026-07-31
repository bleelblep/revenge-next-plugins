import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"

export interface ShowTagStorage {
	onlyUsername: boolean
}

export default plugin<ShowTagStorage>({
	jsonStorage: {
		load: true,
		default: { onlyUsername: false },
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
