export type ServiceType = "lastfm" | "librefm" | "listenbrainz"

export interface ServiceConfig {
	name: string
	baseUrl: string
	requiresApiKey: boolean
	requiresToken: boolean
}

export interface ActivityAssets {
	large_image?: string
	large_text?: string
	small_image?: string
	small_text?: string
}

export interface Activity {
	name: string
	application_id: string
	flags: number
	type: number
	details?: string
	state?: string
	timestamps?: { start: number; end?: number }
	assets?: ActivityAssets
	status_display_type?: number
}

export interface Track {
	name: string
	artist: string
	album: string
	albumArt: string | null
	url: string
	date: string
	nowPlaying: boolean
	loved: boolean
	from: number
	to: number | null
	duration?: number | null
}

export interface ServiceClient {
	fetchLatestScrobble(): Promise<Track>
	validateCredentials(): Promise<boolean>
	getServiceName(): string
}

export interface LFMSettings {
	service?: ServiceType
	appName: string
	timeInterval: number | string
	// Last.fm
	username: string
	apiKey: string
	// Libre.fm
	librefmUsername: string
	librefmApiKey: string
	// ListenBrainz
	listenbrainzUsername: string
	listenbrainzToken: string
	// Display
	showTimestamp: boolean
	listeningTo: boolean
	showLargeText: boolean
	showAlbumInTooltip: boolean
	showDurationInTooltip: boolean
	ignoreYouTubeMusic: boolean
	/** Activity names to treat as "something else is already playing"; suppresses updates. */
	ignoreList: string[]
	verboseLogging: boolean
}
