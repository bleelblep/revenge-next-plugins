// Hiding takes effect immediately for servers currently rendered, but the bar is a
// virtualised list that caches rows -- folders and off-screen servers can keep a stale
// layout until the bundle reloads. Give the user a button rather than telling them to
// force-close the app.

function updater(): any {
	try {
		return (revenge.react.ReactNative as any)?.NativeModules?.BundleUpdaterManager
	} catch {
		return undefined
	}
}

export function canReload(): boolean {
	const mod = updater()
	return typeof mod?.reload === "function" || typeof mod?.restart === "function"
}

/** @returns false when no reload mechanism is available on this client. */
export function reloadDiscord(): boolean {
	const mod = updater()

	for (const method of ["reload", "restart"]) {
		try {
			if (typeof mod?.[method] === "function") {
				mod[method]()
				return true
			}
		} catch {
			/* try the next one */
		}
	}

	return false
}
