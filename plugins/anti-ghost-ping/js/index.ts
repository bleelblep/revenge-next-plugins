import { DEFAULTS } from "./defaults"
import { setStorage } from "./lib/state"
import { watchForGhostPings } from "./lib/watch"
import { registerPages } from "./ui/routes"
import type { AntiGhostPingStorage } from "./types"
import Settings from "./ui/pages/Settings"

export type { AntiGhostPingStorage }
export { DEFAULTS }

export default plugin<{ jsonStorage: AntiGhostPingStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error("[AntiGhostPing] failed to register settings pages:", error)
		}

		try {
			cleanup(watchForGhostPings(jsonStorage))
		} catch (error) {
			console.error("[AntiGhostPing] failed to start watching:", error)
		}
	},
	SettingsComponent: Settings,
})
