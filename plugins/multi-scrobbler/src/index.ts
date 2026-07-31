import Constants from "./constants"
import { initialize, stop, switchService } from "./manager"
import { UserStore, initModules } from "./lib/modules"
import { pluginState, setStorage, settings } from "./lib/state"
import type { LFMSettings, ServiceType } from "./types"
import Settings from "./ui/pages/Settings"

export const DEFAULTS = Constants.DEFAULT_SETTINGS

const MAX_CONNECTION_ATTEMPTS = 3
const RECONNECT_DELAY = 5000

let attempts = 0
let retryTimer: any

function hasCredentials(s: LFMSettings): boolean {
	switch (s.service) {
		case "lastfm":
			return Boolean(s.username && s.apiKey)
		case "librefm":
			return Boolean(s.librefmUsername && s.librefmApiKey)
		case "listenbrainz":
			return Boolean(s.listenbrainzUsername)
		default:
			return false
	}
}

async function tryInitialize() {
	try {
		await initialize()
		attempts = 0
	} catch (error) {
		console.error("[MultiScrobbler] Initialization error:", error)
		attempts++
		if (attempts < MAX_CONNECTION_ATTEMPTS) {
			retryTimer = setTimeout(tryInitialize, RECONNECT_DELAY)
		} else {
			console.error("[MultiScrobbler] Giving up after repeated failures")
		}
	}
}

function startIfConfigured() {
	const s = settings()

	if (!s.service) {
		console.log("[MultiScrobbler] No service selected; configure one in settings")
		return
	}
	if (!hasCredentials(s)) {
		console.error(`[MultiScrobbler] Missing credentials for ${s.service}`)
		return
	}

	// Nothing can be published before the user session exists.
	if (UserStore()?.getCurrentUser?.()) {
		tryInitialize()
		return
	}

	// Replaces the original's `onDiscordReconnect` lifecycle hook, which has no equivalent here.
	const unsubscribe = revenge.discord.flux.onFluxEventDispatched("CONNECTION_OPEN", () => {
		if (UserStore()?.getCurrentUser?.()) {
			unsubscribe()
			tryInitialize()
		}
	})
	return unsubscribe
}

export default plugin<{ jsonStorage: LFMSettings }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)
		pluginState.stopped = false

		// Subscribe for the Discord internals up front so they're resolved before the first poll.
		const unsubscribeModules = initModules()

		const unsubscribeConnection = startIfConfigured()

		// Replaces the original's `onSettingsUpdate` hook: restart when the chosen service changes,
		// otherwise leave the running poll alone so editing a field mid-track doesn't reset it.
		let lastService: ServiceType | undefined = settings().service
		const unsubscribeStorage = jsonStorage.subscribe(() => {
			const next = settings().service
			if (next === lastService) return

			const previous = lastService
			lastService = next

			if (!next) {
				console.log("[MultiScrobbler] Service cleared; stopping")
				stop()
				return
			}

			if (previous) {
				switchService(next)
			} else {
				pluginState.stopped = false
				startIfConfigured()
			}
		})

		cleanup(
			unsubscribeModules,
			() => {
				if (retryTimer) clearTimeout(retryTimer)
			},
			() => unsubscribeConnection?.(),
			unsubscribeStorage,
			stop,
		)
	},
	SettingsComponent: Settings,
})
