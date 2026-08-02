import { DEFAULTS } from "../defaults"
import { resetAliases } from "./alias"
import type { ScreenshotRedactorStorage } from "../types"

let storage: RevengeJsonStorageApi<ScreenshotRedactorStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<ScreenshotRedactorStorage>) {
	storage = handle
}

/**
 * The message-sheet toggle row and the sub-screen pages are rendered outside the plugin's
 * settings component, so they never receive the plugin `api` object and read the handle from
 * here instead.
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
 * The current user's id, memoized.
 *
 * Needed by the mention pass in `lib/rowSchema.ts`: a message carries
 * `isCurrentUserMessageAuthor` for its author, but a mention of *you* inside someone else's
 * message has no equivalent flag, so "redact me too = off" needs the id itself.
 *
 * Memoized because this runs once per content node on the chat render path, and the answer
 * cannot change without the app restarting. `undefined` is not cached — the store may not be
 * ready the first time a row is generated, and caching a miss would mean your own name gets
 * redacted for the rest of the session.
 */
let cachedSelfId: string | undefined

export function currentUserId(): string | undefined {
	if (cachedSelfId) return cachedSelfId

	try {
		const { UserStore } = revenge.discord.flux.Stores as any
		const id = UserStore?.getCurrentUser?.()?.id
		if (typeof id === "string" && id) cachedSelfId = id
	} catch {
		/* store not ready; ask again next row */
	}

	return cachedSelfId
}

export function resetCurrentUserId() {
	cachedSelfId = undefined
}

/**
 * Called when the master toggle flips. Clearing on the *off* edge as well as the on edge means
 * the mapping never outlives the screenshot session it was built for.
 */
export function onEnabledChanged(enabled: boolean) {
	const { resetNumberingOnEnable } = settings()
	if (!enabled || resetNumberingOnEnable) resetAliases()
}
