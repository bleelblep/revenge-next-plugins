import Constants from "../constants"
import type { Activity, LFMSettings } from "../types"

/**
 * Replaces the original's `currentSettings` Proxy over Vendetta's synchronous `plugin.storage`.
 * The storage handle is injected by `start()` rather than imported from the entrypoint, which
 * keeps every module free of an import cycle back to `index.ts`.
 */
let storage: RevengeJsonStorageApi<LFMSettings> | undefined

export function setStorage(handle: RevengeJsonStorageApi<LFMSettings>) {
	storage = handle
}

/** Always falls back to defaults -- `cache` is undefined until the storage read resolves. */
export function settings(): LFMSettings {
	return { ...Constants.DEFAULT_SETTINGS, ...((storage?.cache as LFMSettings) ?? {}) }
}

export function setSettings(patch: Partial<LFMSettings>) {
	storage?.set(patch)
}

/**
 * Reactive read for settings sub-pages. They're rendered by Discord's settings navigator as
 * plain routes, so unlike the root page they never receive the plugin `api` object -- they read
 * through the handle `start()` stashed here instead.
 */
export function useSettings(): LFMSettings {
	const stored = storage?.use()
	return { ...Constants.DEFAULT_SETTINGS, ...(stored ?? {}) }
}

export const pluginState: {
	stopped: boolean
	lastActivity?: Activity | null
	lastTrackUrl?: string
} = {
	stopped: false,
	lastActivity: undefined,
	lastTrackUrl: undefined,
}
