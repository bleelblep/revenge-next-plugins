import { DEFAULTS } from "./defaults"
import { resetAliases } from "./lib/alias"
import { resetChatRows } from "./lib/chatRows"
import { resetDiagnostics } from "./lib/diagnostics"
import { resetCurrentUserId, setStorage } from "./lib/state"
import patchAvatar from "./patches/avatar"
import patchChatManager from "./patches/chatManager"
import patchDisplayName from "./patches/displayName"
import patchDmHeader from "./patches/dmHeader"
import patchMessageActionSheet from "./patches/messageActionSheet"
import patchOverlay from "./patches/overlay"
import patchRowManager from "./patches/rowManager"
import Settings from "./ui/pages/Settings"
import type { ScreenshotRedactorStorage } from "./types"

export type { ScreenshotRedactorStorage }
export { DEFAULTS }

export default plugin<{ jsonStorage: ScreenshotRedactorStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		// Patches are installed unconditionally and gated per-call on `enabled`, rather than
		// installed and removed as the toggle flips. Patching the chat path is the risky part;
		// doing it once at start, on a cold and quiet app, is safer than doing it repeatedly
		// while the chat is on screen.
		//
		// Applied independently -- one moved Discord module should cost one surface, not all
		// three. Losing the overlay should still leave redaction working from settings, and
		// losing the name resolver should still leave message rows redacted.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[ScreenshotRedactor] failed to apply ${name}:`, error)
			}
		}

		// chatManager is the one that matters: it redacts at the JS/native boundary, which is
		// both the last place anything can be changed and the only place the already-drawn rows
		// can be repainted from. rowManager stays as a second line -- it redacts the same
		// `Message` shape through the same function, so the two agreeing costs nothing and it
		// keeps working if a Discord update moves the native module.
		apply("chatManager", patchChatManager)
		apply("rowManager", patchRowManager)
		apply("displayName", patchDisplayName)
		// After displayName, because `dmHeader`'s workaround is decided by whether the `getName`
		// hook registered. It reads that at call time rather than install time, so the order is
		// for readability rather than correctness -- but the dependency is real either way.
		apply("dmHeader", patchDmHeader)
		// The face beside the name. Separate from `dmHeader` on purpose: the header's name and
		// the header's avatar are resolved by two unrelated mechanisms, and treating them as one
		// surface is what let the avatar leak while the name next to it redacted.
		apply("avatar", patchAvatar)
		apply("messageActionSheet", patchMessageActionSheet)
		apply("overlay", patchOverlay)

		// Placeholder numbering is per-session by design; drop it when the plugin stops so a
		// disable/enable cycle can't be used to line two screenshots up against each other.
		// The row mirror goes with it: it is a copy of the visible conversation and has no
		// business outliving the plugin that made it.
		cleanup(() => {
			resetAliases()
			resetChatRows()
			resetDiagnostics()
			resetCurrentUserId()
		})
	},
	SettingsComponent: Settings,
})
