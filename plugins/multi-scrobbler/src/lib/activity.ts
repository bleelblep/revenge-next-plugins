import Constants from "../constants"
import type { Activity } from "../types"
import { recordAssetStage, debugState } from "./debug"
import { Dispatcher, HTTPUtils } from "./modules"
import { pluginState } from "./state"

/**
 * Discord's own HTTP client rejects with a plain `{ status, body }` object rather than an Error,
 * so `.message` is undefined and the failure reads as blank. Serialise whatever we actually got.
 */
function describeError(error: any): string {
	if (!error) return "(empty)"
	// Discord's error bodies carry message/code; the surrounding response carries status. Headers
	// are noise and were previously eating the whole 300-character budget.
	const parts: string[] = []
	if (error.status !== undefined) parts.push(`status ${error.status}`)
	if (error.body?.message) parts.push(String(error.body.message))
	else if (error.message) parts.push(String(error.message))
	if (error.body?.code !== undefined) parts.push(`code ${error.body.code}`)
	if (parts.length) return parts.join(" | ")

	try {
		const { headers, ...rest } = error
		return JSON.stringify(rest).slice(0, 300)
	} catch {
		return String(error)
	}
}

/** Clears whatever this plugin last set. */
export function clearActivity() {
	sendActivity(null)
}

/**
 * Discord has no "set activity" API for plugins -- you dispatch LOCAL_ACTIVITY_UPDATE at the Flux
 * dispatcher and the client picks it up. `pid` and `socketId` just have to be stable and unique
 * to us so repeat dispatches replace rather than stack.
 */
export function sendActivity(activity: Activity | null) {
	if (pluginState.stopped) activity = null
	pluginState.lastActivity = activity

	try {
		Dispatcher().dispatch({
			type: "LOCAL_ACTIVITY_UPDATE",
			activity,
			pid: 2312,
			socketId: "MultiScrobbler@RevengeNext",
		} as any)
	} catch (error) {
		console.error("[MultiScrobbler] Failed to dispatch activity:", error)
	}
}

/**
 * Resolves external image URLs into Discord asset paths.
 *
 * Two things about Discord's HTTP client that cost a debugging round each:
 *  - `url` must be a path *relative* to the API base. Passing the absolute URL (what the original
 *    plugin does) makes it treat the request as external and send no auth token, which comes back
 *    as a 43-byte `401: Unauthorized`. The absolute form is still tried as a fallback in case a
 *    build behaves the other way round.
 *  - `rejectWithError: false` does not reliably stop it throwing, and what it throws is the
 *    response object itself, not an Error. Both paths are treated the same way below.
 */
async function resolveExternalAssets(urls: string[], appId: string): Promise<string[]> {
	const http = HTTPUtils()
	if (!http) {
		recordAssetStage("HTTPUtils module never resolved")
		return []
	}

	const path = `/applications/${appId}/external-assets`
	const attempts: Array<[label: string, url: string]> = [
		["relative", path],
		["absolute", `${http.getAPIBaseURL()}${path}`],
	]

	let last = "no attempt made"

	for (const [label, url] of attempts) {
		let response: any
		try {
			response = await http.post({ url, body: { urls }, oldFormErrors: true, rejectWithError: false })
		} catch (thrown) {
			response = thrown
		}

		const body = response?.body
		if (Array.isArray(body)) {
			const paths = body.map((item: { external_asset_path: string }) => `mp:${item.external_asset_path}`)
			recordAssetStage(`external-assets OK (${label})`, paths[0])
			return paths
		}

		last = `${label}: status ${response?.status ?? "?"} ${describeError(body ?? response)}`
		recordAssetStage("external-assets failed", last)
	}

	return []
}

/** Turns an album-art URL into something Discord will render on the activity card. */
export async function fetchAsset(
	urls: string[],
	appId: string = Constants.APPLICATION_ID,
): Promise<string[]> {
	debugState.httpUtilsResolved = Boolean(HTTPUtils())

	// The commonest reason for no art: the service reported no cover at all, so there is nothing
	// to resolve. Recorded explicitly because it used to return here silently.
	if (!urls?.length) {
		recordAssetStage("no album art URL from service", "-")
		return []
	}

	try {
		const external = urls.filter(url => url?.startsWith("http:") || url?.startsWith("https:"))
		if (!external.length) {
			recordAssetStage("album art URL was not http(s)", urls[0])
			return []
		}

		return await resolveExternalAssets(external, appId)
	} catch (error) {
		recordAssetStage("threw", describeError(error))
		return []
	}
}
