import Constants from "../constants"
import { settings } from "../lib/state"
import type { Track } from "../types"
import { BaseService } from "./BaseService"

interface Listen {
	listened_at: number
	track_metadata: {
		artist_name: string
		track_name: string
		release_name?: string
		additional_info?: {
			duration_ms?: number
			release_mbid?: string
			recording_mbid?: string
			origin_url?: string
		}
	}
	playing_now?: boolean
}

export class ListenBrainzService extends BaseService {
	getServiceName() {
		return "ListenBrainz"
	}

	protected serviceKey() {
		return "listenbrainz" as const
	}

	/** ListenBrainz reports errors as a plain string rather than a numeric code. */
	protected getErrorMessage(error: any): string {
		return error?.error || error?.message || String(error) || "Unknown error"
	}

	private auth(): RequestInit {
		const { listenbrainzToken } = settings()
		return listenbrainzToken ? { headers: { Authorization: `Token ${listenbrainzToken}` } } : {}
	}

	/** Responses arrive as `{listens}`, `{payload:{listens}}` or `{data:{listens}}` by endpoint. */
	private extractListens(response: any): Listen[] | undefined {
		if (!response) return undefined
		if (Array.isArray(response.listens)) return response.listens
		if (Array.isArray(response.payload?.listens)) return response.payload.listens
		if (Array.isArray(response.data?.listens)) return response.data.listens
		return undefined
	}

	async validateCredentials(): Promise<boolean> {
		try {
			const { listenbrainzUsername } = settings()
			if (!listenbrainzUsername) throw new Error("Username not set for ListenBrainz")

			// Reading public listens needs no token, so this doubles as a connectivity check.
			const url = `${Constants.SERVICES.listenbrainz.baseUrl}/user/${encodeURIComponent(listenbrainzUsername)}/listens?count=1`
			await this.makeRequest(url, this.auth())

			this.log("Credentials validated")
			return true
		} catch (error) {
			this.logError("Credentials validation failed:", error)
			return false
		}
	}

	async fetchLatestScrobble(): Promise<Track> {
		const { listenbrainzUsername } = settings()
		if (!listenbrainzUsername) throw new Error("Username not set for ListenBrainz")

		const user = encodeURIComponent(listenbrainzUsername)
		this.logVerbose("Fetching latest listen for", listenbrainzUsername)

		let latest: Listen | undefined

		// "playing-now" is a separate endpoint and 404s / empties when nothing is playing.
		try {
			const playing = this.extractListens(
				await this.makeRequest(
					`${Constants.SERVICES.listenbrainz.baseUrl}/user/${user}/playing-now`,
					this.auth(),
				),
			)
			if (playing?.length) {
				latest = playing[0]
				latest.playing_now = true
			}
		} catch (error) {
			this.logVerbose("Nothing playing now:", error)
		}

		if (!latest) {
			const recent = this.extractListens(
				await this.makeRequest(
					`${Constants.SERVICES.listenbrainz.baseUrl}/user/${user}/listens?count=1`,
					this.auth(),
				),
			)
			if (!recent?.length) throw new Error("No listens found")
			latest = recent[0]
		}

		const meta = latest.track_metadata
		const nowPlaying = Boolean(latest.playing_now)
		const from = latest.listened_at || Math.floor(Date.now() / 1000)

		let duration: number | null = null
		let to: number | null = null
		if (meta.additional_info?.duration_ms) {
			duration = Math.floor(meta.additional_info.duration_ms / 1000)
			if (nowPlaying && duration > 0) to = from + duration
		}

		const track: Track = {
			name: meta.track_name,
			artist: meta.artist_name,
			album: meta.release_name || "",
			// ListenBrainz has no cover of its own; the MusicBrainz release id maps to one.
			albumArt: meta.additional_info?.release_mbid
				? `https://coverartarchive.org/release/${meta.additional_info.release_mbid}/front`
				: null,
			url:
				meta.additional_info?.origin_url ||
				`https://listenbrainz.org/player/${
					meta.additional_info?.recording_mbid ||
					`${encodeURIComponent(meta.artist_name)}/${encodeURIComponent(meta.track_name)}`
				}`,
			date: nowPlaying ? "now" : new Date(from * 1000).toISOString(),
			nowPlaying,
			loved: false,
			from,
			to,
			duration,
		}

		this.logVerbose("Processed track:", track)
		this.log(`${nowPlaying ? "Now playing" : "Last played"}: ${track.artist} - ${track.name}`)
		return track
	}
}
