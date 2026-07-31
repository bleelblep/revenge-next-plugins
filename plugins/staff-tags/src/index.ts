import patchChat from "./patches/chat"
import patchDetails from "./patches/details"
import patchName from "./patches/name"
import patchTag from "./patches/tag"
import Settings from "./ui/pages/Settings"

export interface StaffTagsStorage {
	useRoleColor: boolean
}

/** Also the fallback for every read -- see the note in hide-call-buttons' DEFAULTS. */
export const DEFAULTS: StaffTagsStorage = { useRoleColor: false }

export default plugin<{ jsonStorage: StaffTagsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		// Apply each surface independently -- a single moved Discord module must disable
		// one surface, not make the whole plugin impossible to enable.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[StaffTags] failed to apply ${name} patch:`, error)
			}
		}

		apply("chat", () => patchChat(jsonStorage))
		apply("tag", patchTag)
		apply("name", () => patchName(jsonStorage))
		apply("details", () => patchDetails(jsonStorage))
	},
	SettingsComponent: Settings,
})
