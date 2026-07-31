import { DEFAULTS } from "../defaults"
import { resetAliases } from "./alias"
import type { ScreenshotRedactorStorage } from "../types"

let storage: RevengeJsonStorageApi<ScreenshotRedactorStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<ScreenshotRedactorStorage>) {
	storage = handle
}

/**
 * The overlay toggle is mounted by a patch rather than by the settings navigator, so it never
 * receives the plugin `api` object and reads the handle from here instead.
 */
export function getStorage() {
	return storage
}

/**
 * Settings as they stand right now, falling back to DEFAULTS.
 *
 * `jsonStorage.cache` is possibly-undefined (`load: true` doesn't await the read), so every
 * read goes through here rather than touching `.cache` directly.
 */
export function settings(): ScreenshotRedactorStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

/**
 * The hot-path check, called once per message row. Deliberately narrower than `settings()`:
 * when redaction is off — which is almost always — the row hook does one property read and
 * returns, touching no user data and allocating nothing.
 */
export function isEnabled(): boolean {
	return storage?.cache?.enabled ?? DEFAULTS.enabled
}

/**
 * Called when the master toggle flips. Clearing on the *off* edge as well as the on edge means
 * the mapping never outlives the screenshot session it was built for.
 */
export function onEnabledChanged(enabled: boolean) {
	const { resetNumberingOnEnable } = settings()
	if (!enabled || resetNumberingOnEnable) resetAliases()
}
