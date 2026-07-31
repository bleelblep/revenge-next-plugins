import type { ShowTagStorage } from "../index"

// A zero-width space, prepended to the rewritten name in "only show usernames" mode. Carried
// over from Cynosphere's original -- it stops Discord's own header logic from recognising the
// string as the nickname it just rendered and undoing the substitution.
const ZWSP = "​"

// Webhooks and system messages keep the legacy all-zero discriminator. They have no real tag
// to show, so they're skipped entirely.
const isTagless = (user: any) => !user || (user.bot && user.discriminator === "0000")

/**
 * Rewrites the reply-preview name above a message ("replying to X").
 *
 * The preview stores the *display* name, sometimes prefixed with "@", so the prefix is
 * stripped before comparing and restored afterwards.
 */
function patchReplyPreview(generated: any, onlyUsername: boolean) {
	const ref = generated.referencedMessage?.message
	if (!ref?.username) return

	const { UserStore } = revenge.discord.flux.Stores
	const user = UserStore.getUser(ref.authorId)
	if (isTagless(user)) return

	if (onlyUsername) {
		const hadAt = ref.username.startsWith("@")
		ref.username = ZWSP + user.username
		if (hadAt) ref.username = `@${ref.username}`
		return
	}

	const bare = ref.username.replace("@", "")
	if (user.discriminator === "0") {
		// Current account system: no discriminator, so show the @handle instead.
		if (bare.toLowerCase() !== user.username) ref.username += ` (@${user.username})`
	} else if (bare !== user.username) {
		ref.username += ` (${user.tag})`
	} else {
		ref.username += `#${user.discriminator}`
	}
}

// getModules, not lookupModule: RowManager is chat UI and may not be initialized yet even from
// start() on a cold launch -- lookupModule would give up and permanently cache the miss. See
// docs/porting-rules.md.
export default function patchRowManager(jsonStorage: RevengeJsonStorageApi<ShowTagStorage>): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	let unpatchBefore: (() => void) | undefined
	let unpatchAfter: (() => void) | undefined

	// Deliberately NOT `instead`, even though the original Vendetta plugin's logic is naturally
	// an around-hook. Two `instead` hooks on the same method infinitely recurse in this
	// patcher: `hooks/instead.ts` stores `hookNode.target = parent[key]` at patch time, which
	// is the *proxy* if any patch already exists, so the tail of the chain calls back into the
	// head. Custom Timestamps already puts an `instead` on RowManager.generate, so this plugin
	// stays on before/after -- those are plain linked lists with no per-node target capture and
	// chain safely. See docs/porting-rules.md rule 2.
	//
	// `before` runs, then the instead chain, then `after`, all synchronously within one call, so
	// stashing the row here and consuming it there is safe -- generate is never re-entered.
	let pendingRow: any

	const unsubscribe = getModules<any>(withName("RowManager"), RowManager => {
		if (!RowManager?.prototype?.generate) {
			console.error("[ShowTag] RowManager.prototype.generate not found")
			return
		}

		unpatchBefore = revenge.patcher.before(RowManager.prototype, "generate", (args: any[]) => {
			pendingRow = args?.[0]
			// A before-hook must return the args array -- returning nothing sets args to
			// undefined for every later hook. See docs/porting-rules.md rule 2.
			return args
		})

		// This runs on the chat render path -- anything escaping here takes down the whole
		// ChatView, so the body is guarded and the result is returned on every path.
		unpatchAfter = revenge.patcher.after(RowManager.prototype, "generate", (ret: any) => {
			const row = pendingRow
			pendingRow = undefined

			try {
				if (row?.rowType !== 1) return ret

				const generated = ret?.message
				if (generated?.username == null) return ret

				const author = row.message?.author
				if (isTagless(author)) return ret

				const onlyUsername = !!jsonStorage.cache.onlyUsername
				if (onlyUsername) {
					generated.username = ZWSP + author.username
					patchReplyPreview(generated, true)
					return ret
				}

				const nick = row.message?.nick
				if (author.discriminator === "0") {
					// Current account system: append the @handle, but only when it actually
					// differs from what's already shown.
					if (nick && nick.toLowerCase() !== author.username) {
						generated.username = `${nick} (@${author.username})`
					} else if (generated.username.toLowerCase() !== author.username) {
						generated.username += ` (@${author.username})`
					}
				} else if (nick && nick !== author.username) {
					// Legacy account: show the full name#discriminator tag.
					generated.username = `${nick} (${author.username}#${author.discriminator})`
				} else if (generated.username !== author.username) {
					generated.username += ` (${author.username}#${author.discriminator})`
				} else {
					generated.username += `#${author.discriminator}`
				}

				patchReplyPreview(generated, false)
			} catch (error) {
				console.error("[ShowTag] generate hook failed:", error)
			}

			return ret
		})
	})

	return () => {
		unsubscribe()
		unpatchBefore?.()
		unpatchAfter?.()
	}
}
