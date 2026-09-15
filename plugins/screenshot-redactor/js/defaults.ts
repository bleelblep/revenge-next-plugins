import type { ScreenshotRedactorStorage } from "./types"

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start.
 *
 * `enabled` defaults to false on purpose. A plugin that silently rewrote every name in the app
 * the moment it installed would be indistinguishable from a bug.
 */
export const DEFAULTS: ScreenshotRedactorStorage = {
	enabled: false,
	style: "pseudonym",
	redactAvatars: true,
	redactBadges: false,
	redactSelf: false,
	resetNumberingOnEnable: true,
	showSheetToggle: true,
	showOverlayToggle: false,
	redactResolvedNames: true,
	verboseLogging: false,
}
