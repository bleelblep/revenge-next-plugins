import { DEFAULTS, setStorage } from "./lib/state"
import patchChat from "./patches/chat"
import patchDetails from "./patches/details"
import patchName from "./patches/name"
import patchTag from "./patches/tag"
import Settings from "./ui/pages/Settings"
import { registerPages } from "./ui/routes"
import type { StaffTagsStorage } from "./types"

export { DEFAULTS }
export type { StaffTagsStorage }

export default plugin<{ jsonStorage: StaffTagsStorage }>({
	jsonStorage: {
		load: true,
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

		setStorage(jsonStorage)

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error("[StaffTags] failed to register settings pages:", error)
		}

		// Apply each surface independently -- a single moved Discord module must disable
		// one surface, not make the whole plugin impossible to enable.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[StaffTags] failed to apply ${name} patch:`, error)
			}
		}

		const installTimer = setTimeout(() => {
			apply("chat", () => patchChat(jsonStorage))
			apply("tag", patchTag)
			apply("name", () => patchName(jsonStorage))
			apply("details", () => patchDetails(jsonStorage))
		}, 0)
		cleanup(() => clearTimeout(installTimer))
	},
	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
