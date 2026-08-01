import { redactedName } from "../lib/alias"
import { noteNamePatch } from "../lib/diagnostics"
import { isEnabled, settings } from "../lib/state"

/**
 * The DM header, which took six failed attempts and two wrong diagnoses.
 *
 * Disassembling `DMChannelName` out of the shipped bundle (function 91654 in Discord 340.9)
 * settles what it actually does:
 *
 * ```js
 * function DMChannelName({ userId, style }) {
 *     const name = useStateFromStores([RelationshipStore, UserStore], () => {
 *         let n = RelationshipStore.getNickname(userId)          // a STRING argument
 *         if (n == null) n = getName(UserStore.getUser(userId))  // an OBJECT argument
 *         return n ?? ""
 *     }, [userId])
 *     return jsx(LegacyText, { children: name, accessibilityRole: "header", … })
 * }
 * ```
 *
 * Three separate things had to be wrong at once, which is why this survived so long:
 *
 * 1. **It resolves a person, not a channel.** Attempts 3–6 rewrote `renderChannelTitle` and
 *    `computeChannelName`, which this path never calls — so attempt 6 could confirm the title
 *    prop was being replaced and still watch the real name render.
 * 2. **`getNickname` takes a bare id string.** `patches/displayName.ts` locates its subject by
 *    looking for an argument that is an *object* with a `.id`, so it bailed. Handled there now.
 * 3. **`getNickname` is a method on a Flux store, not a module export.** This is what 0.18.0 got
 *    wrong: `getModules(withProps("getNickname"))` looks for a module whose exports carry that
 *    key, and a store's methods live on its prototype behind a singleton. The name the old Metro
 *    sweep found under module 4320 is a *different* `getNickname`. Hence this file, which goes at
 *    the store directly through the `Stores` proxy the plugin already uses for `UserStore`.
 *
 * The name is also memoized inside `useStateFromStores(…, [userId])`, so the hook alone is not
 * enough — `lib/nudge.ts` emits on these stores so the header re-asks when the toggle flips.
 */

/**
 * Where a per-user nickname might live. `RelationshipStore` is the one the disassembly points at
 * (it is the store that owns friend nicknames), but the environment slot only proves *a* store
 * with `getNickname` on it, not which — so every plausible one is tried and whichever actually
 * has the method gets hooked. Diagnostics reports the winners.
 */
const STORE_CANDIDATES = ["RelationshipStore", "UserStore", "GuildMemberStore", "NicknameStore"]

/**
 * ## Why this hook answers even when there is no nickname
 *
 * Both header paths are `getNickname(userId) ?? getName(user)`:
 *
 * ```js
 * // single DM, inside DMChannelName
 * RelationshipStore.getNickname(userId) ?? getName(UserStore.getUser(userId))
 * // group DM, inside computeChannelName's GROUP_DM branch, once per recipient
 * user.isProvisional ? user.globalName : (getNickname(user.id) ?? getName(user)) ?? "???"
 * ```
 *
 * Through 0.18.5 `getName` was **not hooked at all**, so this returned a placeholder for the
 * `null` case as well, purely to stop the fallback being reached. The symptom that pinned the
 * original bug: in a group DM exactly one name redacted — the recipient *with* a friend nickname
 * went through `getNickname` and was caught, the one without fell through to `getName` and was
 * not.
 *
 * **0.19.0 hooks `getName` properly and this still answers for `null` anyway.** Retiring the
 * workaround was tried and reverted before it shipped, because the two are not equivalent:
 *
 * - This hook is *confirmed working on device*. The `getName` hook is confirmed to **register**,
 *   which is not the same claim — `isGetNameHooked()` reports that a patch was installed, not
 *   that the header's call site reaches it. If `DMChannelName`'s module captured `getName` in a
 *   closure at import time rather than reading it off the namespace per call, the patch is
 *   invisible to exactly this path and nothing would say so.
 * - The failure modes are not symmetric. Keeping the workaround costs a cosmetic side effect;
 *   removing it wrongly puts a real name back on the most-screenshotted surface in the app.
 *
 * So the two overlap deliberately, and the redaction is idempotent, so overlapping is free.
 *
 * **The cost is real and worth stating.** `getNickname` is not the header's private helper; while
 * redaction is armed, everything that asks whether a user has a nickname gets "yes, User 3", and
 * surfaces that branch on a nickname existing render as though one is set. It reverts the moment
 * redaction is switched off, and it is gated on `redactResolvedNames` so it can be turned off
 * without touching anything else.
 *
 * **To retire it**, confirm on device that a DM with someone who has *no* friend nickname still
 * redacts with this hook's `null` branch removed. That is a one-line change and a five-minute
 * check; it is not worth guessing at.
 */

/** A Discord snowflake: 17–19 digits, nothing else. */
const SNOWFLAKE = /^\d{17,19}$/

const cleanups: Array<() => void> = []
let installed = false

function patchStore(store: any, storeName: string) {
	let pendingUserId: string | undefined

	cleanups.push(
		revenge.patcher.before(store, "getNickname", (args: any[]) => {
			try {
				// `getNickname(userId)` on this path. Other call sites pass (userId, guildId) or
				// a channel id, so only the plain single-snowflake form is claimed — mistaking a
				// guild id for a user id would hand it an alias number and corrupt the numbering.
				const [id] = args ?? []
				pendingUserId =
					Array.isArray(args) && args.length >= 1 && typeof id === "string" && SNOWFLAKE.test(id)
						? id
						: undefined
			} catch {
				pendingUserId = undefined
			}
			// Must return the args array -- see docs/porting-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		revenge.patcher.after(store, "getNickname", (ret: any) => {
			const userId = pendingUserId
			pendingUserId = undefined

			try {
				if (!isEnabled()) return ret
				if (!userId) return ret
				// Anything that isn't a name -- an object, a number -- belongs to some other
				// `getNickname` overload and is left alone. `null`/`undefined` deliberately fall
				// through to the redaction below; see the note on it.
				if (ret != null && typeof ret !== "string") return ret

				const { style, redactSelf, redactResolvedNames } = settings()
				if (!redactResolvedNames) return ret

				if (!redactSelf) {
					const { UserStore } = revenge.discord.flux.Stores as any
					if (UserStore?.getCurrentUser?.()?.id === userId) return ret
				}

				return redactedName(userId, style)
			} catch (error) {
				console.error("[ScreenshotRedactor] getNickname hook failed:", error)
			}

			return ret
		}),
	)

	console.log(`[ScreenshotRedactor] hooked ${storeName}.getNickname`)
	noteNamePatch(`${storeName}.getNickname (store)`)
}

/**
 * Installs if it hasn't already. Retried from the row hook for the same reason the native chat
 * module is: the `Stores` proxy resolves lazily and need not be ready when `start()` runs.
 */
export function ensureDmHeaderPatched(): boolean {
	if (installed) return true

	let stores: any
	try {
		stores = revenge.discord.flux.Stores as any
	} catch {
		return false
	}
	if (!stores) return false

	let hooked = 0

	for (const storeName of STORE_CANDIDATES) {
		try {
			const store = stores[storeName]
			if (typeof store?.getNickname !== "function") continue
			patchStore(store, storeName)
			hooked++
		} catch (error) {
			console.error(`[ScreenshotRedactor] failed to hook ${storeName}.getNickname:`, error)
		}
	}

	if (hooked === 0) return false

	installed = true
	return true
}

export default function patchDmHeader(): () => void {
	if (!ensureDmHeaderPatched()) {
		console.log("[ScreenshotRedactor] no store with getNickname yet; will retry when chat renders")
	}

	return () => {
		installed = false
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
