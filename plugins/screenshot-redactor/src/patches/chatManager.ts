import { applyBatch, isReplaying, noteCleared } from "../lib/chatRows"
import { count, noteChatManagerPatch } from "../lib/diagnostics"
import { redactRows } from "../lib/rowSchema"
import { isEnabled, settings } from "../lib/state"

/**
 * Redaction at the JS/native boundary.
 *
 * `DCDChatManager.updateRows(tag, rowsJSON, isLoadingAtTop)` is the single point every message
 * that reaches the screen passes through — `com/discord/chat/ChatModule.java` exposes only it and
 * `clearRows`, and both are `@ReactMethod`s on the plain native module object. Redacting here
 * rather than at `RowManager.prototype.generate` has four consequences worth stating:
 *
 * 1. **It repaints.** The rows can be mirrored and pushed back (see `lib/chatRows.ts`), which is
 *    what makes the toggle take effect without switching channels.
 * 2. **It catches rows generated before we were listening.** A `generate` hook can only ever see
 *    rows made after it was installed.
 * 3. **It is downstream of every other plugin.** Show Tag appends the real `@handle` at
 *    `generate`; whatever it appends is still in this JSON, and gets overwritten here. That
 *    settles README open question 4 — the `HookPriority` guess on the `generate` hook no longer
 *    decides anything.
 * 4. **It is not `generate`.** No contention with custom-timestamps' `instead`, and no exposure
 *    to the two-`instead` recursion bug (porting rule 2), because nothing else in this repo
 *    patches a native module.
 *
 * `before`, not `instead`: the work is a rewrite of `args[1]` in place, and this plugin has never
 * used `instead`.
 */
/**
 * Finding the native module, which is NOT reliably there when `start()` runs.
 *
 * 0.18.0 looked it up once at start and logged `DCDChatManager.updateRows not found` on every
 * launch: `revenge.react.ReactNative` is an ESM live binding that can still be undefined that
 * early (porting rule 1 — the same trap as `getAssetIdByName` at module scope, one lifecycle
 * stage later). `lib/reload.ts` in hide-servers-drawer gets away with the identical access only
 * because it runs from a button press, long after start.
 *
 * So resolution is lazy and retried, and two RN-level fallbacks are tried before giving up:
 * `nativeModuleProxy` is the global RN exposes for exactly this, and works when the `ReactNative`
 * binding hasn't been filled in yet.
 */
function findChatManager(): any {
	const candidates = [
		() => (revenge.react.ReactNative as any)?.NativeModules?.DCDChatManager,
		() => (globalThis as any)?.nativeModuleProxy?.DCDChatManager,
		() => (globalThis as any)?.__turboModuleProxy?.("DCDChatManager"),
	]

	for (const get of candidates) {
		try {
			const manager = get()
			if (typeof manager?.updateRows === "function") return manager
		} catch {
			/* try the next route */
		}
	}

	return undefined
}

/**
 * Metro is the route that actually works, and the direct ones above are only kept as a fast path.
 *
 * 0.18.1 retried `revenge.react.ReactNative.NativeModules` on every generated row and never once
 * resolved — the log said `DCDChatManager not ready at start` and then never said `hooked`. So it
 * is not a timing problem after all: that binding does not give a usable `NativeModules` here,
 * and neither RN global is present either.
 *
 * Discord's own call site is a plain `NativeModules.DCDChatManager` (see `customKeyboardWillHide`,
 * function 90472), so the object exists as an ordinary Metro module — which means the finder API
 * can hand it over, and is the documented way to wait for a module that may not be initialized
 * yet (porting rule 3). `getModules`, not `lookupModule`: a miss would be cached permanently.
 */
function subscribeForChatManager(): () => void {
	try {
		const { getModules } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters

		return getModules(
			withProps("DCDChatManager"),
			(mod: any) => {
				if (installed) return
				const manager = mod?.DCDChatManager
				if (typeof manager?.updateRows !== "function") return

				installed = true
				install(manager)
			},
			{ max: 5 },
		)
	} catch (error) {
		console.error("[ScreenshotRedactor] could not subscribe for DCDChatManager:", error)
		return () => {}
	}
}

const cleanups: Array<() => void> = []
let installed = false

/**
 * Installs the hooks if they aren't already and the module can be found.
 *
 * Called from `start()` and again from the `generate` hook, which only fires once chat is
 * actually rendering — by which point React Native is unambiguously up. Cheap enough to call per
 * row: one boolean read on the hot path.
 */
export function ensureChatManagerPatched(): boolean {
	if (installed) return true

	const manager = findChatManager()
	if (!manager) return false

	installed = true
	install(manager)
	return true
}

export default function patchChatManager(): () => void {
	let unsubscribe: (() => void) | undefined

	if (!ensureChatManagerPatched()) {
		console.log("[ScreenshotRedactor] DCDChatManager not directly reachable; asking Metro for it")
		noteChatManagerPatch("waiting on Metro")
		unsubscribe = subscribeForChatManager()
	}

	return () => {
		installed = false
		try {
			unsubscribe?.()
		} catch {
			/* already gone */
		}
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
		cleanups.length = 0
	}
}

function install(manager: any) {

	cleanups.push(
		revenge.patcher.before(manager, "updateRows", (args: any[]) => {
			try {
				if (!isReplaying()) {
					const tag = args?.[0]
					const json = args?.[1]

					if (typeof tag === "number" && typeof json === "string") {
						const rows = JSON.parse(json)

						if (Array.isArray(rows)) {
							count("batchesSeen")

							// The mirror always takes the *unredacted* rows, whether or not
							// redaction is on right now — it is the "what this really says"
							// copy, and toggling off has to be able to restore from it.
							applyBatch(tag, rows)

							if (isEnabled()) {
								const { style, redactAvatars, redactBadges, redactSelf } = settings()

								// A second parse rather than a clone of `rows`: the mirror keeps
								// the originals and this copy gets rewritten. Only paid while
								// redaction is armed.
								const outgoing = JSON.parse(json)
								const redacted = redactRows(outgoing, {
									style,
									avatars: redactAvatars,
									badges: redactBadges,
									self: redactSelf,
								})

								if (redacted > 0) count("rowsRedacted")
								args[1] = JSON.stringify(outgoing)
							}
						}
					}
				}
			} catch (error) {
				// Never let this take the chat down: on any failure the original JSON goes
				// through untouched, which is a leak rather than a broken client.
				console.error("[ScreenshotRedactor] updateRows hook failed:", error)
			}

			// A before-hook must return the args array, and outside the try so it survives a
			// throw above. See docs/porting-rules.md rule 2.
			return args
		}),
	)

	if (typeof manager.clearRows === "function") {
		cleanups.push(
			revenge.patcher.before(manager, "clearRows", (args: any[]) => {
				try {
					// Native sets `rows = null` here, so the next batch will be a full sync. The
					// mirror has to follow or it will start splicing into a stale list.
					if (!isReplaying() && typeof args?.[0] === "number") noteCleared(args[0])
				} catch (error) {
					console.error("[ScreenshotRedactor] clearRows hook failed:", error)
				}

				return args
			}),
		)
	}

	console.log("[ScreenshotRedactor] DCDChatManager hooked")
	noteChatManagerPatch("patched")
}
