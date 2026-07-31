import { redactedAvatarUrl, redactedName } from "../lib/alias"
import {
	count,
	countRowManager,
	noteAvatarKey,
	noteDepth,
	noteRowType,
	noteSkippedRowTypeWithAuthor,
} from "../lib/diagnostics"
import { isEnabled, settings } from "../lib/state"

/**
 * Chat redaction runs on the *data* a message row is built from, not on the rendered tree.
 *
 * `RowManager.prototype.generate` turns a raw message into the flat object the native row
 * renderer consumes — display name, avatar URL, reply preview, all in one place. Rewriting
 * fields on that object is the same category of work as Show Tag, which is the one render-
 * adjacent patch in this repo with no crash history. The alternative sketched in
 * docs/plugin-ideas.md — walking and rewriting the React tree for every message header — is
 * both far riskier and unnecessary for this surface.
 *
 * Inline @mentions and the member list go through `patches/displayName.ts`. The DM channel
 * header is not covered by anything — see the README's "The DM header" section.
 */

/**
 * Fields on a generated row holding an identifying image URL.
 *
 * `avatarURL` is confirmed on device; the alternative spellings this once guessed at
 * (`avatarUrl`, `avatar`, `authorAvatarURL`) were never once seen and are gone. `roleIconURL`
 * and `roleIcon` likewise never appeared — kept out rather than carried as dead weight on a
 * path that runs a few hundred times per screenful.
 */
const AVATAR_KEYS = ["avatarURL"]

/**
 * Decorations say something about the account (Nitro) even once the avatar itself is anonymous,
 * so they're cleared rather than substituted. `avatarDecorationURL` is confirmed on device.
 *
 * ## The server-tag fields are NOT here, and that is a known leak
 *
 * A row dump showed `clanTag`, `clanTagGuildId` and a CDN `clanBadgeUrl` on every message —
 * Discord's server-tag badge, which renders next to the username and narrows down which server
 * someone belongs to. 0.16.0 added them here and **visibly broke the client**, so 0.17.1 took
 * them back out.
 *
 * The cause is confirmed (reverting fixed it) and it is the clearing strategy, not the idea:
 * `redactAvatars` assigns `""`, and an empty string is not "absent" — `clanBadgeUrl: ""` is an
 * image URI Discord will try to load. On the observed row, absent values were `null`
 * (`avatarDecorationURL`) or `undefined` (`roleIcon`, `lobbyTagIconUrl`), never `""`.
 *
 * That makes the one key left in this list suspect too: `avatarDecorationURL` only survives
 * because it is usually already `null`, so the `typeof === "string"` guard means the branch
 * almost never runs. The clan fields were simply the first ones that actually exercised it.
 *
 * Anyone revisiting this should switch the clearing to `undefined`/`null` first, confirm
 * `avatarDecorationURL` still behaves, then re-add the clan fields one at a time.
 */
const ORNAMENT_KEYS = ["avatarDecorationURL"]

let dumped = false

/**
 * One-shot dump of a generated row's shape, so the avatar field can be identified on device
 * rather than guessed. Logs key names and whether each value looks like a CDN URL — never the
 * values themselves, since those are the very strings this plugin exists to keep out of sight.
 */
function dumpRowShape(generated: any) {
	if (dumped) return
	dumped = true

	try {
		const shape = Object.keys(generated).map(key => {
			const value = (generated as any)[key]
			const kind = value === null ? "null" : typeof value
			const cdn = typeof value === "string" && value.includes("cdn.discordapp.com")
			return `${key}:${kind}${cdn ? "(cdn)" : ""}`
		})
		console.log("[ScreenshotRedactor] generated row shape:", shape.join(" "))
	} catch (error) {
		console.error("[ScreenshotRedactor] row dump failed:", error)
	}
}

/** Rewrites every avatar-shaped field present on `target`. */
function redactAvatars(target: any, userId: string) {
	for (const key of AVATAR_KEYS) {
		if (typeof target?.[key] === "string") {
			target[key] = redactedAvatarUrl(userId)
			noteAvatarKey(key)
		}
	}
	for (const key of ORNAMENT_KEYS) {
		if (typeof target?.[key] === "string") {
			target[key] = ""
			noteAvatarKey(key)
		}
	}
}

/**
 * The reply preview above a message ("replying to X") names a second person, who is just as
 * identifiable as the author and is missed entirely if only the header is redacted.
 *
 * The stored name is sometimes "@"-prefixed; the prefix is preserved so the row still looks
 * like a reply preview rather than a broken string.
 */
function redactReplyPreview(generated: any, style: any, alsoAvatars: boolean) {
	const ref = generated.referencedMessage?.message
	if (!ref) return

	const authorId = ref.authorId ?? ref.author?.id
	if (!authorId) return

	if (typeof ref.username === "string") {
		const hadAt = ref.username.startsWith("@")
		ref.username = redactedName(authorId, style)
		if (hadAt) ref.username = `@${ref.username}`
	}

	if (alsoAvatars) redactAvatars(ref, authorId)
}

/**
 * Patches one RowManager class.
 *
 * `pendingRow` lives in this closure rather than at module scope so that two different
 * RowManager classes — which is the whole reason `max` is raised below — can never read each
 * other's stashed row if one ever generates a row while the other is mid-call.
 */
/**
 * A runaway stack means `after` stopped firing for some calls (an exception thrown further down
 * the hook chain, say). Clearing beats growing without bound, and beats pairing rows with the
 * wrong call forever after.
 */
const MAX_DEPTH = 32

function patchOne(RowManager: any, cleanups: Array<() => void>) {
	const { HookPriority } = revenge.patcher as any

	// Deliberately NOT `instead`: custom-timestamps already owns the one permitted `instead` on
	// this method, and a second one can infinitely recurse in this patcher. before/after are
	// plain linked lists and chain safely. See docs/porting-rules.md rule 2.
	//
	// `after` receives only the return value, so the row itself is stashed by `before` and
	// consumed there.
	//
	// A STACK, not the single slot this used to have (and that show-tag still has). The original
	// suspicion -- that `generate` re-enters itself for reply previews, letting an inner call
	// consume the slot -- was NOT borne out: device runs consistently report a maximum depth of
	// 1. The rows that looked lost turned out to be non-message rows with a non-numeric
	// `rowType`, which the counter split now separates properly.
	//
	// The stack stays because it is correct at any depth and costs nothing, and because "no row
	// at all" is now counted on its own (`skippedNoRow`) rather than hiding inside the row-type
	// skips, where it went unnoticed for four releases.
	const stack: any[] = []

	cleanups.push(
		revenge.patcher.before(RowManager.prototype, "generate", (args: any[]) => {
			if (stack.length >= MAX_DEPTH) stack.length = 0
			stack.push(args?.[0])
			noteDepth(stack.length)
			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook on this method, which is how Custom Timestamps
			// once took down the whole ChatView. See docs/porting-rules.md rule 2.
			return args
		}),
	)

	cleanups.push(
		revenge.patcher.after(
			RowManager.prototype,
			"generate",
			(ret: any) => {
				const row = stack.pop()

				// Every path returns `ret`. This is the chat render path: an exception or a
				// missing return here takes down the entire message list.
				try {
					count("rowsSeen")
					noteRowType(row?.rowType)

					if (!isEnabled()) {
						count("skippedDisabled")
						return ret
					}
					// Split from skippedRowType on purpose: "no row at all" is a pairing bug in
					// this plugin, "row with a different type" is a genuine non-message row.
					// Counting them together is what hid the missed rows in the first place.
					if (row == null) {
						count("skippedNoRow")
						return ret
					}
					if (row.rowType !== 1) {
						count("skippedRowType")
						// A divider or date separator being skipped is correct. A skipped row
						// that carries an author is a leak, and the two were indistinguishable
						// in every dump so far.
						if (row.message?.author?.id) noteSkippedRowTypeWithAuthor()
						return ret
					}

					const generated = ret?.message
					if (!generated) {
						count("skippedNoMessage")
						return ret
					}

					const { style, redactAvatars: doAvatars, redactSelf, verboseLogging } = settings()

					if (verboseLogging) dumpRowShape(generated)

					const author = row.message?.author
					const authorId = author?.id
					if (!authorId) {
						count("skippedNoAuthor")
						return ret
					}

					if (!redactSelf) {
						const { UserStore } = revenge.discord.flux.Stores as any
						if (UserStore?.getCurrentUser?.()?.id === authorId) {
							count("skippedSelf")
							return ret
						}
					}

					if (typeof generated.username === "string") {
						generated.username = redactedName(authorId, style)
					}

					if (doAvatars) redactAvatars(generated, authorId)

					redactReplyPreview(generated, style, doAvatars)
					count("rowsRedacted")
				} catch (error) {
					console.error("[ScreenshotRedactor] generate hook failed:", error)
				}

				return ret
			},
			// Show Tag *appends* the real @handle to the same field this hook overwrites, so
			// whichever runs last wins. LOWEST is the intent ("run after everyone else");
			// whether the patcher orders the after-chain that way is unverified on device --
			// see the README's open questions. If Show Tag re-reveals handles while both are
			// on, flip this to HIGHEST.
			{ priority: HookPriority?.LOWEST ?? -1000 },
		),
	)

	countRowManager()
}

// getModules, not lookupModule: RowManager is chat UI and may not be initialized yet even from
// start() on a cold launch -- lookupModule would give up and permanently cache the miss.
// See docs/porting-rules.md rule 3.
export default function patchRowManager(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const cleanups: Array<() => void> = []
	// Two module entries can resolve to the same class; patching its prototype twice would
	// install two redundant hook pairs.
	const seen = new Set<any>()

	const unsubscribe = getModules(
		withName("RowManager"),
		(RowManager: any) => {
			if (!RowManager?.prototype?.generate) {
				console.error("[ScreenshotRedactor] RowManager.prototype.generate not found")
				return
			}
			if (seen.has(RowManager.prototype)) return
			seen.add(RowManager.prototype)

			try {
				patchOne(RowManager, cleanups)
			} catch (error) {
				console.error("[ScreenshotRedactor] failed to patch a RowManager:", error)
			}
		},
		// `max` defaults to 1, so the plain call patches only the *first* RowManager and stops.
		// That is the leading suspect for redaction working in guild chat but not DMs: if the
		// build ships more than one of these, whichever loads second is never hooked. Raised to
		// match the precedent set by staff-tags' UserRow lookup, which hit the same default.
		{ max: 10 },
	)

	return () => {
		unsubscribe()
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
