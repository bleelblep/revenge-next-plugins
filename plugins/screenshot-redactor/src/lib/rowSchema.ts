/**
 * The chat bridge wire format, taken from Discord's own serializers rather than guessed.
 *
 * Everything the message list draws crosses the JS/native boundary exactly once, as the JSON
 * argument to `DCDChatManager.updateRows`. That JSON is deserialized on the native side by
 * kotlinx.serialization classes whose generated `$$serializer`s name every field explicitly, and
 * those classes are readable in the jadx decompile of the shipped APK:
 *
 *   com/discord/chat/bridge/row/RowSerializer.java      — the row discriminator
 *   com/discord/chat/bridge/row/MessageRow$$serializer  — the row envelope
 *   com/discord/chat/bridge/Message$$serializer         — every field on a message
 *   com/discord/chat/bridge/referencedmessage/…         — the reply preview
 *
 * This matters because the plugin's previous field lists came from `dumpRowShape` — a one-shot
 * dump of a single row that had actually been scrolled past. That can only ever report fields
 * that happened to be populated on that row, which is exactly how `clanTag`/`clanBadgeUrl` went
 * unnoticed for fifteen releases. A schema read from the deserializer lists every field that
 * *can* be present, whether or not this account has ever received one.
 *
 * Schema below is from Discord Android 337.10.
 */

import { redactedAvatarUrl, redactedName } from "./alias"
import { noteAvatarKey } from "./diagnostics"
import type { RedactionStyle } from "../types"

/**
 * `ChangeType`, an `IntEnum` — serialized as the bare integer, not the name.
 * From `com/discord/chat/bridge/ChangeType.java`.
 */
export const ChangeType = {
	NOOP: 0,
	INSERT: 1,
	UPDATE: 2,
	DELETE: 3,
} as const

/**
 * Identifying fields on a `Message`, grouped by how confident we are that clearing them is safe.
 *
 * ## Clearing with `""` is what broke the client in 0.16.0
 *
 * `clanBadgeUrl: ""` is not "absent" — it is an image URI Discord tries to load. Every field here
 * is therefore cleared to `null`, which is what the wire format actually uses for absent values
 * (all of these are `@Optional` nullable properties in the Kotlin classes). The README's
 * instruction for retrying the badge fields was "switch the clearing to `undefined` (or `null`)
 * first"; this is that.
 */

/** Swapped for a placeholder avatar, not cleared — a message with no avatar looks broken. */
export const AVATAR_URL_KEYS = ["avatarURL"] as const

/** Nitro decorations and role icons — say something about the account even once the face is gone. */
export const ORNAMENT_KEYS = ["avatarDecorationURL", "roleIcon"] as const

/**
 * The server-tag badge and friends.
 *
 * ## The native serializer is not the JS row shape — read the device for this list
 *
 * 0.18.0 populated this from `Message$$serializer` and got it **wrong**: that class lists what
 * the native side will *accept*, which overlaps with but is not the same as what JS actually puts
 * on a row. It named `tagText`/`tagType`/`connectionsRoleTag`, which on a real device are
 * `null`/`undefined` on every message seen — and it omitted the three fields that are actually
 * populated, which are the `clan*` ones the original row dump found all along.
 *
 * It also invented `avatarURLs`, which does not exist on the JS row at all.
 *
 * The lesson is not "the decompile was useless" — it answered the bridge protocol and the DM
 * header correctly. It is that a *deserializer* is authoritative for the wire format and a
 * *device dump* is authoritative for what is on the object. For "which fields carry an identity
 * right now", the dump wins. The `tag*` names are kept because they are real fields that a future
 * build may start populating, and clearing an already-null field costs nothing.
 *
 * Off by default: clearing this family is precisely what visibly broke the client in 0.16.0.
 * The cause is understood — that code assigned `""`, and `clanBadgeUrl: ""` is an image URI
 * Discord tries to load, where absent is `null` — and this clears to `null`. But that was a
 * confident diagnosis last time too.
 */
export const BADGE_KEYS = [
	// Confirmed populated on a real message, Discord 340.9.
	"clanTag",
	"clanTagGuildId",
	"clanBadgeUrl",
	// Present but null/undefined on every row observed so far; harmless to clear, and they are
	// where the same badge appears to be migrating.
	"tagText",
	"tagAccessibilityLabel",
	"tagVerified",
	"tagType",
	"tagIconUrl",
	"opTagText",
	"connectionsRoleTag",
	// Custom name styling from collectibles — narrows down what the account owns.
	"displayNameStyles",
	"lobbyAdditionalName",
	"lobbyTagIconUrl",
] as const

/**
 * Every field on a `Message` that can carry an identity, for the audit line in Diagnostics.
 * Deliberately includes the ones this plugin does *not* redact, because the failure mode is
 * silent: anything present on a row and not listed here is in the screenshot by default.
 */
export const KNOWN_IDENTITY_KEYS: readonly string[] = [
	...AVATAR_URL_KEYS,
	...ORNAMENT_KEYS,
	...BADGE_KEYS,
	"username",
	"authorId",
	// Not redacted, and that is a deliberate choice rather than an oversight: role colour is a
	// weak signal on its own, and blanking it changes the look of the message enough that the
	// screenshot stops resembling what the user saw.
	"usernameColor",
	"roleColor",
	"colorString",
	"shouldShowRoleDot",
	"shouldShowRoleOnName",
]

export interface RedactOptions {
	style: RedactionStyle
	avatars: boolean
	badges: boolean
	self: boolean
}

function clear(target: any, keys: readonly string[]) {
	for (const key of keys) {
		// `!= null` on purpose: absent is absent, whether it arrived as null or undefined, and
		// writing null over null would mark rows as changed for no reason.
		if (target[key] != null) {
			target[key] = null
			noteAvatarKey(key)
		}
	}
}

/**
 * Rewrites one `Message` in place. Returns true if anything was changed.
 *
 * Idempotent by construction — every replacement is derived from `authorId` rather than from the
 * current value of the field — so it is safe for this to run over a row that `RowManager`'s hook
 * already redacted, which is the normal case while both patches are installed.
 */
export function redactMessage(message: any, options: RedactOptions): boolean {
	if (!message || typeof message !== "object") return false

	const authorId = message.authorId
	if (typeof authorId !== "string" || !authorId) return false

	if (!options.self) {
		// `isCurrentUserMessageAuthor` is on the wire already (Message$$serializer), so the
		// common case needs no store lookup at all on a path that runs per row.
		if (message.isCurrentUserMessageAuthor === true) return false
	}

	if (typeof message.username === "string") {
		// Reply previews store the name "@"-prefixed. Keeping the prefix means the row still
		// reads as a reply preview rather than as a broken string.
		const hadAt = message.username.startsWith("@")
		message.username = redactedName(authorId, options.style)
		if (hadAt) message.username = `@${message.username}`
	}

	if (options.avatars) {
		for (const key of AVATAR_URL_KEYS) {
			if (typeof message[key] === "string") {
				message[key] = redactedAvatarUrl(authorId)
				noteAvatarKey(key)
			}
		}
		clear(message, ORNAMENT_KEYS)
	}

	if (options.badges) clear(message, BADGE_KEYS)

	// The reply preview is a whole nested Message (LoadedReferencedMessage = {state, message,
	// systemContent}), so it redacts through exactly the same path rather than a parallel
	// implementation that can drift. `state` 0 is LOADED; a system reference carries no author.
	const referenced = message.referencedMessage
	if (referenced?.message) redactMessage(referenced.message, options)

	return true
}

/** Every message-bearing row in a batch, redacted. @returns how many rows were rewritten. */
export function redactRows(rows: any[], options: RedactOptions): number {
	let redacted = 0

	for (const row of rows) {
		// Gate on carrying an author, not on the row's `type` discriminator. The old hook
		// gated on `rowType === 1` and had no way to tell "a divider, correctly skipped" from
		// "a system message that names someone, silently leaked" — README open question 5.
		// Anything with an authorId is a thing that identifies a person, whatever row it is.
		if (redactMessage(row?.message, options)) redacted++
	}

	return redacted
}
