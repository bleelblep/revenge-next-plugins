import patchChat from "./patches/chat"
import patchDetails from "./patches/details"
import patchName from "./patches/name"
import patchTag from "./patches/tag"

export interface StaffTagsStorage {
	useRoleColor: boolean
}

export default plugin<StaffTagsStorage>({
	jsonStorage: {
		load: true,
		default: { useRoleColor: false },
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
	// SettingsComponent intentionally omitted: confirmed on-device (twice, on two different
	// plugins) that registering it crashes Discord's entire Settings screen on open, not just
	// this plugin's own page -- "Invariant Violation: Setting <id> is missing a title", from
	// Discord's own getSettingTitle during useDescriptors for the whole Settings navigator.
	// Revenge Next's wiring for this (useTitle: () => plugin.manifest.name) matches its real
	// source exactly, unchanged across the 2026-07-25 plugin-system rewrite, and nobody else
	// has reported this upstream -- root cause unconfirmed. useRoleColor stays at its
	// jsonStorage default (false) until this is understood.
})
