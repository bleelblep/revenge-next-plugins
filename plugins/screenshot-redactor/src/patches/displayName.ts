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

function patchOne(namespace: any, key: string, label: string, cleanups: Array<() => void>) {
	// before + after rather than `instead`, matching show-tag: `after` alone can't see which
	// user a returned string belongs to, and `instead` is rationed repo-wide (porting rule 2).
	// The resolver is synchronous and not re-entrant, so one slot between the two is safe.
	let pendingUser: any

	cleanups.push(
		revenge.patcher.before(namespace, key, (args: any[]) => {
			try {
				pendingUser = findUser(args)
			} catch {
				pendingUser = undefined
			}
			// Must return the args array -- see docs/porting-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		revenge.patcher.after(namespace, key, (ret: any) => {
			const user = pendingUser
			pendingUser = undefined

			try {
				if (!isEnabled()) return ret
				if (typeof ret !== "string" || !user?.id) return ret

				const { style, redactSelf, redactResolvedNames } = settings()
				if (!redactResolvedNames) return ret

				if (!redactSelf) {
					const { UserStore } = revenge.discord.flux.Stores as any
					if (UserStore?.getCurrentUser?.()?.id === user.id) return ret
				}

				return redactedName(user.id, style)
			} catch (error) {
				console.error("[ScreenshotRedactor] name hook failed:", error)
			}

			return ret
		}),
	)

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
				(mod: any) => {
					try {
						if (typeof mod?.[candidate] !== "function") return
						if (seen.has(mod[candidate])) return
						seen.add(mod[candidate])
						patchOne(mod, candidate, `${candidate} (props)`, cleanups)
					} catch (error) {
						console.error(`[ScreenshotRedactor] failed to patch ${candidate}:`, error)
					}
				},
				{ max: 5 },
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
				{ max: 5, returnNamespace: true },
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
