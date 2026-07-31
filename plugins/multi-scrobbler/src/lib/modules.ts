// Nothing here is read at module scope -- this file is evaluated at preInit, long before any of
// these modules exist. See docs/porting-rules.md rule 1.
//
// These use `getModules`, not `lookupModule`. Both the asset manager and Discord's HTTP client
// initialize lazily, and are very unlikely to be loaded at the first poll. `lookupModule` gives up
// immediately and *permanently caches the miss*, so album art would be broken for the whole
// session with no way to recover -- exactly the trap in porting rule 3. `getModules` subscribes
// and fills these in whenever the modules actually load.

let httpUtils: any

/**
 * Resolves the Discord internals this plugin needs. Call once from `start()`; returns an
 * unsubscribe for the plugin's cleanup list.
 */
export function initModules(): () => void {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	// No AssetManager lookup here on purpose. The original resolves `getAssetIds` and calls
	// `fetchAssetIds` first, but that module never matched on Discord 340+/341+ under any of
	// `fetchAssetIds`, `getAssetIds` or `getAssetImage` -- and it is the wrong tool regardless:
	// it resolves assets *uploaded to a Discord application*, whereas album art is an arbitrary
	// external URL. The external-assets endpoint is the mechanism for those, and it works.
	const subscriptions = [
		getModules(withProps("getAPIBaseURL", "get"), (mod: any) => {
			httpUtils = mod
		}),
		// Discord won't accept a LOCAL_ACTIVITY_UPDATE dispatch until the module owning
		// SET_ACTIVITY has initialized. Subscribing is enough to force that; the value is unused.
		getModules(withProps("SET_ACTIVITY"), () => {}),
	]

	return () => {
		for (const unsubscribe of subscriptions) unsubscribe()
	}
}

/** Discord's own HTTP client -- carries the auth token, unlike a bare fetch. */
export function HTTPUtils():
	| {
			get: (opts: Record<string, unknown>) => Promise<any>
			post: (opts: Record<string, unknown>) => Promise<any>
			getAPIBaseURL: () => string
	  }
	| undefined {
	return httpUtils
}

export function SelfPresenceStore() {
	return (revenge.discord.flux.Stores as any).SelfPresenceStore
}

export function UserStore() {
	return (revenge.discord.flux.Stores as any).UserStore
}

export function Dispatcher() {
	return revenge.discord.common.flux.Dispatcher
}
