/**
 * Getting already-rendered messages to pick up a toggle.
 *
 * The message list is virtualised and rows are generated once, so flipping redaction on does
 * not by itself repaint what's on screen — new and re-scrolled messages come out redacted
 * while the visible ones stay as they were, which is the worst possible failure mode for a
 * plugin whose whole job is "nothing identifying is on screen right now".
 *
 * Nudging a store the chat subscribes to is the same trick hide-servers-drawer uses on the
 * guilds bar (`patches/sortedGuilds.ts`). It is best-effort: whether it reaches the row cache
 * is unverified on device, which is why `refreshChat()` reports back and the settings page
 * tells the user to reopen the channel when it can't.
 */

const STORE_NAMES = ["MessageStore", "UserStore", "ChannelStore"]
const EMIT_METHODS = ["doEmitChanges", "emitChange"]

/** @returns a "Store.method" description of what it managed to call, or undefined. */
export function refreshChat(): string | undefined {
	let stores: any
	try {
		stores = revenge.discord.flux.Stores as any
	} catch {
		return undefined
	}

	for (const name of STORE_NAMES) {
		for (const method of EMIT_METHODS) {
			try {
				const store = stores?.[name]
				if (typeof store?.[method] === "function") {
					store[method]()
					return `${name}.${method}`
				}
			} catch {
				/* try the next one */
			}
		}
	}

	return undefined
}
