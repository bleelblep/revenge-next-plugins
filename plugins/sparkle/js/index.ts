import { watchDiscord } from "./lib/reactions"
import { DEFAULTS, type SparkleStorage } from "./native"
import Settings from "./ui/pages/Settings"
import { registerPages } from "./ui/routes"
import { registerSync, savedSettings, setStorage, syncFromNative, update } from "./ui/state"
import { CHANGELOG } from "./changelog"
import { setupChangelog } from "../../../shared/changelog"
import * as native from "@revenge-mod/modules/native"
import { reportError, setReporter } from "../../../shared/report"

const DEBUG: boolean = false

/** The magic JS method is registered once per session; `alive` makes a stale one inert. */
let magicRegistered = false
let alive = false

/**
 * Sparkle: a pixel unicorn living on top of Discord. Native (src/main/kotlin) draws it and runs its
 * behaviour; JS mirrors the settings for the pages and forwards Discord events (lib/reactions.ts).
 */
export default plugin<{ jsonStorage: SparkleStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		setStorage(jsonStorage)

		// Native owns the values; bring the mirror in line, now and whenever Quick Toggles changes one.
		syncFromNative().then(() => {
			// The Turkey (look 16) is hidden from the pet list; don't leave anyone on a pet they can't pick.
			if (savedSettings().look === 16) update({ look: 0 })
		})
		cleanup(registerSync("bleelblep.sparkle", syncFromNative))

		// Native casts a spell and asks here for VFX to show it (VFX's methods are another plugin's).
		if (!magicRegistered) {
			try {
				;(native as any).registerJSMethod("bleelblep.sparkle.magic", () => {
					if (!alive) return
					// The spell list from settings goes along; VFX picks from what it allows.
					const { spellMode, spellList } = savedSettings()
					;(native as any)
						.callNativeMethod("bleelblep.screen-effects.surprise", [null, { mode: spellMode, list: spellList }])
						.catch(() => { if (DEBUG) console.warn("[Sparkle] no magic: VFX isn't running") })
				})
				magicRegistered = true
			} catch (error) {
				reportError("[Sparkle] could not register magic:", error)
			}
		}
		alive = true
		// Native only calls `magic` once told it's there: a missing JS method is Revenge's error dialog.
		const magicReady = (ready: boolean) =>
			(native as any).callNativeMethod("bleelblep.sparkle.magicReady", [ready]).catch(() => {})
		if (magicRegistered) magicReady(true)
		cleanup(() => {
			alive = false
			if (magicRegistered) magicReady(false)
		})

		cleanup(registerPages())
		try {
			cleanup(watchDiscord())
		} catch (error) {
			reportError("[Sparkle] could not watch Discord events:", error)
		}
	},
	SettingsComponent: Settings,
})
