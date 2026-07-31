import { DEFAULTS } from "./defaults"
import { setStorage } from "./lib/state"
import { watchRelationships } from "./lib/watch"
import type { RelationshipNotifierStorage } from "./types"
import Settings from "./ui/pages/Settings"
import { registerPages } from "./ui/routes"

export type { RelationshipNotifierStorage }
export { DEFAULTS }

export default plugin<{ jsonStorage: RelationshipNotifierStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error("[RelationshipNotifier] failed to register settings pages:", error)
		}

		try {
			cleanup(watchRelationships(jsonStorage))
		} catch (error) {
			console.error("[RelationshipNotifier] failed to start watching:", error)
		}
	},
	SettingsComponent: Settings,
})
