import { redactedName } from "../lib/alias"
import { noteNamePatch } from "../lib/diagnostics"
import { isEnabled, settings } from "../lib/state"

/**
 * Redacting names *wherever the client resolves them*, rather than per-surface.
 *
 * The DM channel header was originally filed as stage 2 on the reasoning that a channel header
 * says "#general". In a DM it says a person's name — so for the surface people are most likely
 * to screenshot, the header is the single most identifying thing on screen and the RowManager
 * hook never touches it. Chasing the header component specifically would have fixed one surface;
 * inline @mentions, the member list, the profile sheet and the mention autocomplete would each
 * have needed their own patch after it.
 *
 * Discord resolves a user's display name through a shared helper — the `getName(guildId,
 * channelId, user)` family — which nearly every one of those surfaces goes through. Patching
 * that redacts all of them at once, and is a string-in/string-out data patch rather than render
 * work.
 *
 * Whether this build exposes such a module under a name we can find is UNVERIFIED. The candidate
 * list below is a guess; `Diagnostics` in settings reports which candidates actually matched, so
 * one device round-trip settles it.
 */

/**
 * The shared user-name resolvers.
 *
 * Not guesses any more — a Metro sweep (`lib/probe.ts`, read over `adb logcat`) found two
 * modules exporting this family, and `useName` alone was covering less than assumed:
 *
 *   3970: getName, useName, getGlobalName, getFormattedName, getUserTag, useUserTag
 *   4320: getNickname, getName, useName
 *
 * `getUserDisplayName`, guessed at in 0.3.0, does not exist anywhere and has been dropped.
 */
const CANDIDATES = [
	"getName",
	"useName",
	"getNickname",
	"getGlobalName",
	"getFormattedName",
	"getUserTag",
	"useUserTag",
]

/**
 * Finds the argument that looks like a user object.
 *
 * The resolver's signature differs between call sites and builds — `getName(user)`,
 * `getName(guildId, user)`, `getName(guildId, channelId, user)` — so the user is located by
 * shape rather than by position.
 */
function findUser(args: any[]): any {
	if (!Array.isArray(args)) return undefined
	for (const arg of args) {
		if (arg && typeof arg === "object" && typeof arg.id === "string") {
			if ("username" in arg || "globalName" in arg || "global_name" in arg) return arg
		}
	}
	return undefined
}

/** A Discord snowflake: 17–19 digits, nothing else. */
const SNOWFLAKE = /^\d{17,19}$/

/**
 * `getNickname` is the one resolver in this family that takes a bare **user id string** rather
 * than a user object, and that is the whole reason the DM header stayed unredacted through six
 * attempts to fix it.
 *
 * Disassembling `DMChannelName` out of the shipped bundle settles what the header actually does:
 *
 * ```js
 * const name = useStateFromStores([RelationshipStore, UserStore], () => {
 *     let n = RelationshipStore.getNickname(userId)          // string argument
 *     if (n == null) n = getName(UserStore.getUser(userId))  // object argument
 *     return n ?? ""
 * }, [userId])
 * ```
 *
 * So the header *does* go through this family — attempt 2's theory was right and was abandoned
 * too early — but `findUser` returns undefined for `getNickname(userId)`, the hook bails, and the
 * real nickname goes straight through. `getName` is only reached when no nickname is set, which
 * is why the header looked like it resolved a channel rather than a user: for anyone with a
 * nickname, the resolver the plugin *could* handle was never called at all.
 *
 * Deliberately narrow. `getName(guildId, channelId, user)` also takes snowflakes, and treating
 * one of those as a user id would hand a guild an alias number and quietly corrupt the numbering.
 * The fallback therefore applies only to the exact observed call: `getNickname` with one
 * snowflake argument.
 */
function findUserId(key: string, args: any[]): string | undefined {
	if (key !== "getNickname") return undefined
	if (!Array.isArray(args) || args.length !== 1) return undefined
	const [id] = args
	return typeof id === "string" && SNOWFLAKE.test(id) ? id : undefined
}

function patchOne(namespace: any, key: string, label: string, cleanups: Array<() => void>) {
	// before + after rather than `instead`, matching show-tag: `after` alone can't see which
	// user a returned string belongs to, and `instead` is rationed repo-wide (porting rule 2).
	// The resolver is synchronous and not re-entrant, so one slot between the two is safe.
	let pendingUserId: string | undefined

	cleanups.push(
		revenge.patcher.before(namespace, key, (args: any[]) => {
			try {
				pendingUserId = findUser(args)?.id ?? findUserId(key, args)
			} catch {
				pendingUserId = undefined
			}
			// Must return the args array -- see docs/porting-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		revenge.patcher.after(namespace, key, (ret: any) => {
			const userId = pendingUserId
			pendingUserId = undefined

			try {
				if (!isEnabled()) return ret
				if (typeof ret !== "string" || !userId) return ret

				const { style, redactSelf, redactResolvedNames } = settings()
				if (!redactResolvedNames) return ret

				if (!redactSelf) {
					const { UserStore } = revenge.discord.flux.Stores as any
					if (UserStore?.getCurrentUser?.()?.id === userId) return ret
				}

				return redactedName(userId, style)
			} catch (error) {
				console.error("[ScreenshotRedactor] name hook failed:", error)
			}

			return ret
		}),
	)

	console.log(`[ScreenshotRedactor] hooked name resolver: ${label}`)
	noteNamePatch(label)
}

export default function patchDisplayName(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName, withProps } = revenge.modules.finders.filters

	const cleanups: Array<() => void> = []
	const unsubscribes: Array<() => void> = []
	const seen = new Set<any>()

	for (const candidate of CANDIDATES) {
		// withProps finds the module that *contains* the helper (the common case — these are
		// utility bundles, not default exports); withName finds it when it is the export itself.
		unsubscribes.push(
			getModules(
				withProps(candidate),
				(mod: any, id: unknown) => {
					try {
						// **The resolvers live on `default`, not on the exports object.**
						//
						// This is what defeated six attempts at the DM header, and @mentions and
						// the member list with it. The finder was never the problem —
						// `withProps('getName')` returns 26 modules on device — but the callback
						// checked `mod.getName`, found `undefined`, and dropped every one of
						// them. A device probe shows the shape unambiguously:
						//
						//     1214.getName: exports=undefined default.getName=function
						//
						// and module 1214 carries all seven resolvers together. `useUserTag` was
						// the sole hook that ever landed, and only because it happens to be its
						// own module, caught by the `withName` + `returnNamespace` finder below
						// which does look at `.default`.
						//
						// Both shapes are tried rather than swapping one guess for another: the
						// exports object is still the right place for a module that isn't wrapped.
						const host = typeof mod?.[candidate] === "function" ? mod : mod?.default

						if (typeof host?.[candidate] !== "function") return
						if (seen.has(host[candidate])) return
						seen.add(host[candidate])

						const where = host === mod ? "props" : "default.props"
						patchOne(host, candidate, `${candidate} (${where}, module ${String(id)})`, cleanups)
					} catch (error) {
						console.error(`[ScreenshotRedactor] failed to patch ${candidate}:`, error)
					}
				},
				// Raised from 5. `getName` is a common enough export that the five nearest
				// matches need not include the one the group-DM title actually calls, and a
				// resolver that is merely *not reached* looks identical to one that is broken.
				// Patching a wide net is safe here because the `after` hook only rewrites when
				// `before` found a user-shaped argument -- an unrelated `getName(someConfig)`
				// passes straight through.
				{ max: 25 },
			),
		)

		unsubscribes.push(
			getModules(
				withName(candidate),
				(mod: any) => {
					try {
						if (typeof mod?.default !== "function") return
						if (seen.has(mod.default)) return
						seen.add(mod.default)
						patchOne(mod, "default", `${candidate} (default)`, cleanups)
					} catch (error) {
						console.error(`[ScreenshotRedactor] failed to patch ${candidate} default:`, error)
					}
				},
				{ max: 25, returnNamespace: true },
			),
		)
	}

	return () => {
		unsubscribes.forEach(unsubscribe => {
			try {
				unsubscribe()
			} catch {
				/* already gone */
			}
		})
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
