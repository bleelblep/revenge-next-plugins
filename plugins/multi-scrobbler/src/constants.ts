import type { LFMSettings, ServiceConfig, ServiceType } from "./types"

const Constants = {
	DEFAULT_APP_NAME: "Music",
	/** Discord application the activity is attributed to. From the original plugin. */
	APPLICATION_ID: "1054951789318909972",
	/** Don't poll more than once every 3s or the services rate-limit us. */
	MIN_UPDATE_INTERVAL: 3,
	/** Libre.fm specifically asked for a 1-minute floor to reduce load on their instance. */
	LIBREFM_MIN_UPDATE_INTERVAL: 60,
	MAX_RETRY_ATTEMPTS: 3,
	RETRY_DELAY: 5000,

	SERVICES: {
		lastfm: {
			name: "Last.fm",
			baseUrl: "https://ws.audioscrobbler.com/2.0",
			requiresApiKey: true,
			requiresToken: false,
		},
		librefm: {
			name: "Libre.fm",
			baseUrl: "https://libre.fm/2.0",
			requiresApiKey: true,
			requiresToken: false,
		},
		listenbrainz: {
			name: "ListenBrainz",
			baseUrl: "https://api.listenbrainz.org/1",
			requiresApiKey: true,
			requiresToken: true,
		},
	} as Record<ServiceType, ServiceConfig>,

	/** Last.fm and Libre.fm serve these hashes as their generic "no cover" image. */
	DEFAULT_COVER_HASHES: ["2a96cbd8b46e442fc41c2b86b821562f"],

	DEFAULT_SETTINGS: {
		service: undefined,
		appName: "Music",
		timeInterval: 5,
		username: "",
		apiKey: "",
		librefmUsername: "",
		librefmApiKey: "",
		listenbrainzUsername: "",
		listenbrainzToken: "",
		showTimestamp: true,
		listeningTo: true,
		showLargeText: true,
		showAlbumInTooltip: true,
		showDurationInTooltip: false,
		ignoreYouTubeMusic: false,
		ignoreList: [],
		verboseLogging: false,
	} as LFMSettings,

	API_ERROR_CODES: {
		2: "Invalid service",
		3: "Invalid method",
		4: "Invalid format",
		5: "Invalid parameters",
		6: "Invalid resource specified",
		7: "Invalid session key",
		8: "Invalid API key",
		9: "Invalid session",
		10: "Invalid API signature",
		11: "Service offline",
		13: "Invalid method signature supplied",
		16: "Service temporarily unavailable",
		26: "Suspended API key",
		29: "Rate limit exceeded",
	} as Record<number, string>,
}

export default Constants
