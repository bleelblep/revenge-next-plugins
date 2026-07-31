import Constants from "../constants"
import { settings } from "../lib/state"
import { AudioscrobblerService } from "./AudioscrobblerService"

export class LastFmService extends AudioscrobblerService {
	getServiceName() {
		return "Last.fm"
	}
	protected serviceKey() {
		return "lastfm" as const
	}
	protected baseUrl() {
		return Constants.SERVICES.lastfm.baseUrl
	}
	protected credentials() {
		const s = settings()
		return { username: s.username, apiKey: s.apiKey }
	}
}
