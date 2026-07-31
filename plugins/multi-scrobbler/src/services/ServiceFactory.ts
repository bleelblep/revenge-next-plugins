import { settings } from "../lib/state"
import type { ServiceClient, ServiceType } from "../types"
import { LastFmService } from "./LastFmService"
import { LibreFmService } from "./LibreFmService"
import { ListenBrainzService } from "./ListenBrainzService"

const instances = new Map<ServiceType, ServiceClient>()

function create(type: ServiceType): ServiceClient {
	switch (type) {
		case "lastfm":
			return new LastFmService()
		case "librefm":
			return new LibreFmService()
		case "listenbrainz":
			return new ListenBrainzService()
		default:
			throw new Error(`Unknown service type: ${type}`)
	}
}

/** Instances are cached so retry counters survive between polls. */
export function getService(type?: ServiceType): ServiceClient {
	const resolved = type ?? settings().service
	if (!resolved) throw new Error("No service configured")

	let instance = instances.get(resolved)
	if (!instance) {
		instance = create(resolved)
		instances.set(resolved, instance)
	}
	return instance
}

export function getCurrentService(): ServiceClient {
	return getService(settings().service)
}

export function validateCurrentService(): Promise<boolean> {
	return getCurrentService().validateCredentials()
}

export function clearServiceCache() {
	instances.clear()
}

export const SUPPORTED_SERVICES: ServiceType[] = ["lastfm", "librefm", "listenbrainz"]
