import type { Track } from "../types"
import { BaseService } from "./BaseService"

interface ScrobblerTrack {
	name: string
	artist: { name: string } | string
	album: { "#text": string } | string
	image?: Array<{ size: string; "#text": string }>
	url: string
	date?: { "#text": string; uts: string }
	"@attr"?: { nowplaying: boolean }
	loved: string
}

/**
 * Last.fm and Libre.fm both speak the Audioscrobbler 2.0 API, so the request and parse logic
 * lives here once rather than being duplicated per service as it is upstream. Subclasses supply
 * only their display name, base URL, and where their credentials are stored.
 */
export abstract class AudioscrobblerService extends BaseService {
	protected abstract baseUrl(): string
	protected abstract credentials(): { username: string; apiKey: string }

	async validateCredentials(): Promise<boolean> {
		try {
			const { username, apiKey } = this.credentials()
			if (!username || !apiKey) {
				throw new Error(`Username or API key not set for ${this.getServiceName()}`)
			}

			const params = new URLSearchParams({
				method: "user.getinfo",
				user: username,
				api_key: apiKey,
				format: "json",
			})

			await this.makeRequest(`${this.baseUrl()}?${params}`)
			this.log("Credentials validated")
			return true
		} catch (error) {
			this.logError("Credentials validation failed:", error)
			return false
		}
	}

	async fetchLatestScrobble(): Promise<Track> {
		const { username, apiKey } = this.credentials()
		if (!username || !apiKey) {
			throw new Error(`Username or API key not set for ${this.getServiceName()}`)
		}

		this.logVerbose("Fetching latest scrobble for", username)

		const params = new URLSearchParams({
			method: "user.getrecenttracks",
			user: username,
			api_key: apiKey,
			limit: "1",
			extended: "1",
			format: "json",
		})

		const data = await this.makeRequest(`${this.baseUrl()}?${params}`)
		const latest: ScrobblerTrack | undefined = data?.recenttracks?.track?.[0]
		if (!latest) throw new Error("No tracks found")

		const nowPlaying = Boolean(latest["@attr"]?.nowplaying)
		const from = latest.date?.uts
			? Number.parseInt(latest.date.uts, 10)
			: Math.floor(Date.now() / 1000)

		// artist/album come back as either a bare string or an object depending on the endpoint.
		const resolve = (value: any, altKey = "name"): string => {
			if (!value) return ""
			if (typeof value === "string") return value
			return value["#text"] ?? value[altKey] ?? ""
		}

		let duration: number | null = null
		let to: number | null = null

		// Track length needs a second request, and is only worth it for a live progress bar.
		if (nowPlaying) {
			try {
				const infoParams = new URLSearchParams({
					method: "track.getInfo",
					track: latest.name,
					artist: resolve(latest.artist),
					api_key: apiKey,
					format: "json",
				})
				const info = await this.makeRequest(`${this.baseUrl()}?${infoParams}`)
				const ms = info?.track?.duration ? Number.parseInt(info.track.duration, 10) : 0
				if (ms > 0) {
					duration = Math.floor(ms / 1000)
					to = from + duration
				}
			} catch (error) {
				this.logVerbose("Failed to fetch track duration:", error)
			}
		}

		const track: Track = {
			name: latest.name,
			artist: resolve(latest.artist),
			album: resolve(latest.album, "title"),
			albumArt: this.processAlbumArt(latest.image?.find(img => img.size === "large")?.["#text"]),
			url: latest.url,
			date: latest.date?.["#text"] ?? "now",
			nowPlaying,
			loved: latest.loved === "1",
			from,
			to,
			duration,
		}

		this.logVerbose("Processed track:", track)
		this.log(`${nowPlaying ? "Now playing" : "Last played"}: ${track.artist} - ${track.name}`)
		return track
	}
}
