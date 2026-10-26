import { DEFAULTS, type NativeState, type ScreenEffectsStorage, callNative } from "./native"
import { registerFxCommand } from "./lib/messageEffects"
import { registerSpellOptions } from "./lib/spells"
import { watchMessages } from "./triggers"
import Settings from "./ui/pages/Settings"
import { registerPages } from "./ui/routes"
import { EFFECT_OPTIONS, FILTER_OPTIONS, PARTICLE_OPTIONS } from "./ui/options"
import { registerSync, setStorage, syncFromNative, update } from "./ui/state"
import { CHANGELOG } from "./changelog"
import { setupChangelog } from "../../../shared/changelog"
import { reportError, setReporter } from "../../../shared/report"

export default plugin<{ jsonStorage: ScreenEffectsStorage }>({
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

		// Native owns the values; bring the mirror in line. The custom inputs are JS-only, so keep them.
		callNative("getSettings")
			.then((state: NativeState) => {
				if (!state || typeof state.intensity !== "number") return
				const { supported, apiLevel, rendererTier, hardwareAccelerated, effects, filters, messageCapabilities, rippleDiagnostics, hooked, brokenStyles, custom, customLoaded, powerCustom, powerCustomLoaded, textHooked, highScore, ...stored } = state
				jsonStorage.set({ ...stored })
				// A saved choice that is no longer offered (hidden, or removed like Hyperdream) goes back
				// to the default, natively too.
				const offered = <T>(options: { value: T }[], value: T) => options.some(o => o.value === value)
				const reset: Partial<ScreenEffectsStorage> = {}
				if (!offered(EFFECT_OPTIONS, stored.style)) reset.style = DEFAULTS.style
				if (!offered(PARTICLE_OPTIONS, stored.particles)) reset.particles = DEFAULTS.particles
				if (!offered(FILTER_OPTIONS, stored.filter)) reset.filter = DEFAULTS.filter
				if (Object.keys(reset).length) update(reset)
			})
			.catch(error => reportError("[ScreenEffects] getSettings failed:", error))

		cleanup(registerPages())
		// Quick Toggles changes settings in native; it calls this so open pages follow.
		cleanup(registerSync("bleelblep.screen-effects", syncFromNative))
		// What Shimeji's spells can show, with names, for its spell list.
		cleanup(registerSpellOptions())

		// Native checks the onSend/onReceive switches itself, so the mirror can never be stale here.
		cleanup(
			watchMessages(
				kind => {
					callNative("trigger", [kind]).catch(error =>
						reportError("[ScreenEffects] trigger failed:", error),
					)
				},
				(effect, mine) => {
					// The switch only silences other people's; your own always play (forced).
					callNative("messageEffect", [effect, mine]).catch(error =>
						reportError("[ScreenEffects] message effect failed:", error),
					)
				},
			),
		)

		try {
			cleanup(registerFxCommand())
		} catch (error) {
			reportError("[ScreenEffects] failed to register /fx:", error)
		}
	},
	SettingsComponent: Settings,
})
