import { DEFAULTS } from "./defaults"
import { restoreBackupIntoStorage, saveBackupFromStorage } from "./lib/backup"
import { setStorage } from "./lib/state"
import { watchForDeletions } from "./lib/watch"
import { patchVisuals } from "./lib/visuals"
import { registerPages } from "./ui/routes"
import type { GhostLogStorage } from "./types"
import Settings from "./ui/pages/Settings"

export type { GhostLogStorage }
export { DEFAULTS }

export default plugin<{ jsonStorage: GhostLogStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		void restoreBackupIntoStorage(jsonStorage, "if-empty")

		if ((jsonStorage.cache?.backupEnabled ?? DEFAULTS.backupEnabled) && (jsonStorage.cache?.log?.length ?? 0) > 0) {
			void saveBackupFromStorage(jsonStorage, jsonStorage.cache?.log ?? [])
		}

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error("[GhostLog] failed to register settings pages:", error)
		}

		try {
			cleanup(watchForDeletions(jsonStorage))
		} catch (error) {
			console.error("[GhostLog] failed to start watching:", error)
		}

		try {
			cleanup(patchVisuals(jsonStorage))
		} catch (error) {
			console.error("[GhostLog] failed to start visual patching:", error)
		}
	},
	SettingsComponent: Settings,
})
