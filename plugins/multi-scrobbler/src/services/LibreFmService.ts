import Constants from "../constants"
import { settings } from "../lib/state"
import { AudioscrobblerService } from "./AudioscrobblerService"

export class LibreFmService extends AudioscrobblerService {
	getServiceName() {
		return "Libre.fm"
	}
	protected serviceKey() {
		return "librefm" as const
	}
	protected baseUrl() {
		return Constants.SERVICES.librefm.baseUrl
	}
	protected credentials() {
		const s = settings()
		return { username: s.librefmUsername, apiKey: s.librefmApiKey }
	}
}
