/**
 * Making the React surfaces re-resolve names.
 *
 * This file used to try to repaint the message list, which was never possible — those rows live
 * in native Kotlin once they cross the bridge, and `lib/chatRows.ts` explains why and what
 * replaced it. What it does now is the thing a store emit genuinely *can* do: re-run components
 * that subscribe to stores.
 *
 * That matters for exactly one surface, and it is the one this plugin has been unable to redact
 * since 0.3.0. Disassembling `DMChannelName` shows the header name is computed inside a
 * `useStateFromStores([RelationshipStore, UserStore], selector, [userId])` — memoized, and
 * re-evaluated only when one of those stores emits. So even with the resolver correctly hooked
 * (see `patches/displayName.ts`), arming redaction leaves the header showing the name it
 * resolved when the channel opened. Nudging the two stores it subscribes to is what makes it
 * ask again.
 *
 * `RelationshipStore` is where a friend nickname comes from and is the first thing the header
 * asks; `UserStore` supplies the object for the `getName` fallback. The rest are included
 * because the same memoized-resolver shape covers the member list and profile sheets, and an
 * emit on a store nobody is listening to costs nothing.
 */

const STORE_NAMES = ["RelationshipStore", "UserStore", "GuildMemberStore", "ChannelStore"]
const EMIT_METHODS = ["emitChange", "doEmitChanges"]

/** @returns the "Store.method" descriptions of everything it managed to call. */
export function nudgeStores(): string[] {
	let stores: any
	try {
		stores = revenge.discord.flux.Stores as any
	} catch {
		return []
	}

	const called: string[] = []

	for (const name of STORE_NAMES) {
		for (const method of EMIT_METHODS) {
			try {
				const store = stores?.[name]
				if (typeof store?.[method] === "function") {
					store[method]()
					called.push(`${name}.${method}`)
					break
				}
			} catch {
				/* try the next method, then the next store */
			}
		}
	}

	return called
}
