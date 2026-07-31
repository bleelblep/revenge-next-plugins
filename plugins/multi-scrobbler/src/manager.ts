import Constants from "./constants"
import { clearActivity, fetchAsset, sendActivity } from "./lib/activity"
import { debugState, recordServiceError, recordSuccessfulUpdate, setDebugInfo } from "./lib/debug"
import { SelfPresenceStore } from "./lib/modules"
import { pluginState, settings } from "./lib/state"
import { formatDuration, getCurrentTimestamp } from "./lib/time"
import { clearServiceCache, getCurrentService, validateCurrentService } from "./services/ServiceFactory"
import type { Activity, ServiceType } from "./types"

const enum ActivityType {
	PLAYING = 0,
	LISTENING = 2,
}

const log = (...m: any[]) => console.log("[MultiScrobbler]", ...m)
const logError = (...m: any[]) => console.error("[MultiScrobbler] Error:", ...m)
const logVerbose = (...m: any[]) => {
	if (settings().verboseLogging) console.log("[MultiScrobbler] Verbose:", ...m)
}

let updateTimer: any
let reconnectTimer: any
let consecutiveFailures = 0
let isReconnecting = false

/** True when another app the user asked us to defer to is already broadcasting an activity. */
function ignoredActivityName(): string | undefined {
	const { ignoreList } = settings()
	if (!ignoreList?.length) return undefined

	try {
		const found = SelfPresenceStore()?.findActivity?.((activity: any) => {
			if (!activity?.name) return false
			return ignoreList.some(ignored => activity.name.toLowerCase().includes(ignored.toLowerCase()))
		})
		return found?.name
	} catch {
		return undefined
	}
}

/**
 * Services report the scrobble time, which for a track that's been playing a while can be far in
 * the past. Discord would render that as an absurd elapsed time, so anything older than an hour
 * gets re-anchored to roughly now.
 */
function buildTimestamps(from: number, to: number | null, duration?: number | null) {
	const now = getCurrentTimestamp()
	let start = from

	if (start < now - 3600) {
		start = duration && duration > 0 ? now - Math.min(duration * 0.1, 30) : now
		logVerbose("Scrobble timestamp was stale; estimated a start time")
	}

	const timestamps: { start: number; end?: number } = { start: start * 1000 }
	if (to) timestamps.end = to * 1000
	return timestamps
}

/** Substitutes {{artist}}, {{name}}, {{album}} and {{service}} into a custom activity name. */
function applyTemplate(name: string, values: Record<string, string>) {
	if (!name.includes("{{")) return name
	let result = name
	for (const [key, value] of Object.entries(values)) {
		result = result.replace(new RegExp(`{{${key}}}`, "g"), value || "")
	}
	return result
}

async function updateActivity() {
	if (pluginState.stopped) {
		stopUpdates()
		return
	}

	const s = settings()

	try {
		const ignored = ignoredActivityName()
		if (ignored) {
			log(`"${ignored}" is already broadcasting; clearing activity`)
			setDebugInfo("ignoredActivity", ignored)
			clearActivity()
			return
		}

		const service = getCurrentService()
		const serviceName = service.getServiceName()
		logVerbose(`Fetching latest track from ${serviceName}`)

		const track = await service.fetchLatestScrobble()
		setDebugInfo("lastTrack", track)

		if (!track.nowPlaying) {
			logVerbose("Nothing currently playing; clearing activity")
			clearActivity()
			return
		}

		// URL is the cheapest stable identity for a scrobble.
		if (pluginState.lastTrackUrl === track.url) {
			logVerbose("Track unchanged; skipping update")
			recordSuccessfulUpdate()
			consecutiveFailures = 0
			return
		}

		log(`Track changed: ${track.artist} - ${track.name}`)
		debugState.lastTrack = `${track.artist} - ${track.name}`
		debugState.lastAlbumArtUrl = track.albumArt ?? "(none reported)"

		const activity: Activity = {
			name: applyTemplate(s.appName || Constants.DEFAULT_APP_NAME, {
				artist: track.artist,
				name: track.name,
				album: track.album,
				service: serviceName,
			}),
			flags: 0,
			type: s.listeningTo ? ActivityType.LISTENING : ActivityType.PLAYING,
			details: track.name,
			state: track.artist,
			status_display_type: 1,
			application_id: Constants.APPLICATION_ID,
		}

		if (s.showTimestamp && track.from) {
			activity.timestamps = buildTimestamps(track.from, track.to, track.duration)
		}

		if (track.album || track.albumArt) {
			const [largeImage] = await fetchAsset(track.albumArt ? [track.albumArt] : [])

			// Tooltip text is only meaningful when there's an image to hover.
			const tooltip: string[] = []
			if (s.showLargeText) {
				if (s.showAlbumInTooltip && track.album) tooltip.push(`on ${track.album}`)
				if (s.showDurationInTooltip && track.duration) tooltip.push(formatDuration(track.duration))
			}

			if (largeImage) {
				activity.assets = { large_image: largeImage }
				if (tooltip.length) activity.assets.large_text = tooltip.join(" • ")
			} else if (tooltip.length) {
				activity.assets = { large_text: tooltip.join(" • ") }
			}
		}

		setDebugInfo("lastActivity", activity)
		sendActivity(activity)

		pluginState.lastTrackUrl = track.url
		consecutiveFailures = 0
		recordSuccessfulUpdate()
		log(`Updated: ${track.artist} - ${track.name}`)
	} catch (error) {
		logError("Update failed:", error)
		recordServiceError(s.service as ServiceType | undefined, (error as Error).message)
		handleFailure(error as Error)
	}
}

function handleFailure(error: Error) {
	consecutiveFailures++
	setDebugInfo("lastError", error.message)
	logError(`Failure ${consecutiveFailures}/${Constants.MAX_RETRY_ATTEMPTS}: ${error.message}`)

	if (consecutiveFailures >= Constants.MAX_RETRY_ATTEMPTS) {
		logError("Max retries reached; entering reconnect loop")
		startReconnection()
	}
}

function startReconnection() {
	if (isReconnecting) return
	isReconnecting = true
	stopUpdates()

	reconnectTimer = setInterval(() => {
		log("Attempting to reconnect...")
		initialize()
			.then(() => {
				log("Reconnected")
				stopReconnection()
			})
			.catch(error => logError("Reconnect attempt failed:", error?.message))
	}, Constants.RETRY_DELAY)
}

function stopReconnection() {
	if (reconnectTimer) clearInterval(reconnectTimer)
	reconnectTimer = undefined
	isReconnecting = false
	consecutiveFailures = 0
}

function stopUpdates() {
	if (updateTimer) clearInterval(updateTimer)
	updateTimer = undefined
}

export async function initialize() {
	if (pluginState.stopped) throw new Error("Plugin is stopped")

	const serviceName = getCurrentService().getServiceName()
	log(`Initializing with ${serviceName}`)

	if (!(await validateCurrentService())) {
		throw new Error(`Invalid credentials for ${serviceName}`)
	}
	log(`${serviceName} credentials validated`)

	stopUpdates()
	await updateActivity()

	// Libre.fm asked for a much higher floor than the others; honour whichever is larger.
	const floor =
		settings().service === "librefm"
			? Constants.LIBREFM_MIN_UPDATE_INTERVAL
			: Constants.MIN_UPDATE_INTERVAL

	const interval = Math.max(
		(Number(settings().timeInterval) || Number(Constants.DEFAULT_SETTINGS.timeInterval)) * 1000,
		floor * 1000,
	)

	updateTimer = setInterval(updateActivity, interval)
	log(`Polling every ${interval / 1000}s`)
}

export function stop() {
	if (pluginState.stopped) return
	pluginState.stopped = true

	try {
		stopUpdates()
		stopReconnection()
		clearActivity()
		log("Stopped")
	} catch (error) {
		logError("Stop error:", error)
	}
}

export async function switchService(next: ServiceType) {
	log(`Switching to ${next}`)
	const wasRunning = !pluginState.stopped

	stop()
	clearServiceCache()
	pluginState.lastTrackUrl = undefined

	if (wasRunning) {
		pluginState.stopped = false
		try {
			await initialize()
		} catch (error) {
			logError("Failed to switch service:", error)
		}
	}
}

export function getStatus() {
	return {
		running: !pluginState.stopped,
		service: settings().service,
		consecutiveFailures,
		isReconnecting,
		lastTrackUrl: pluginState.lastTrackUrl,
		polling: Boolean(updateTimer),
	}
}
