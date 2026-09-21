/**
 * Loading the messages that were never on screen.
 *
 * `MessageStore` holds only what the client has already fetched, which is roughly one page —
 * about fifty raw messages, and fewer once bots and system notices are filtered out. So
 * `/catchup 100` in a channel you have just opened was summarising twenty-seven messages and
 * saying so quietly in its footer, which is accurate and completely unhelpful: the number you
 * typed should be the number you get.
 *
 * This asks Discord for the rest, a page at a time, the same way scrolling up would.
 *
 * ## Why it polls the store instead of awaiting the call
 *
 * `fetchMessages` is a Flux action creator. Whether it returns a promise, and whether that
 * promise resolves before or after the store's reducers have run, is not something to rely on
 * across Discord builds. Watching the store for growth is true by construction: it is the thing
 * we actually need to have happened.
 *
 * ## It gives up cheaply
 *
 * Every limit here exists so a summary in a quiet channel cannot turn into a long series of API
 * calls. A page that comes back no larger than the last one means the history has run out, and
 * that ends it immediately.
 */

import { debug } from './state'

/** Discord's own maximum per request. */
const PAGE_SIZE = 100
/** Total pages per `/catchup`, whatever was asked for. Five pages is five hundred messages. */
const MAX_PAGES = 5
/** How long to wait for the store to reflect one fetch before giving up on it. */
const PAGE_TIMEOUT_MS = 4000
const POLL_MS = 120

let actions: any
let actionsResolved = false

/** Resolved lazily. Never at module scope -- porting rule 1. */
function getActions(): any {
	if (actionsResolved) return actions
	actionsResolved = true

	// Route 1: by source path, confirmed present in the 343.11 bundle.
	try {
		const finders =
			(revenge.discord.utils as any)?.modules?.finders ??
			(revenge.discord.utils as any)?.finders
		finders?.getModuleWithImportedPath?.(
			'actions/MessageActionCreators.tsx',
			(exports: any) => {
				const host =
					typeof exports?.fetchMessages === 'function'
						? exports
						: exports?.default
				if (typeof host?.fetchMessages === 'function' && !actions) {
					actions = host
					console.log(
						'[CatchUp] backfill will use actions/MessageActionCreators.tsx',
					)
				}
			},
		)
	} catch (error) {
		debug('imported-path lookup for fetchMessages threw:', error)
	}

	// Route 2: by shape, in case the path moves.
	if (!actions) {
		try {
			const { lookupModule } = revenge.modules.finders
			const { withProps } = revenge.modules.finders.filters
			const [mod, id] = lookupModule(withProps('fetchMessages')) as [
				any,
				number | undefined,
			]
			if (id !== undefined) {
				// The export is usually on `default`, not the namespace -- porting rule 3.
				const host =
					typeof mod?.fetchMessages === 'function' ? mod : mod?.default
				if (typeof host?.fetchMessages === 'function') {
					actions = host
					console.log(`[CatchUp] backfill will use module ${id}`)
				}
			}
		} catch (error) {
			debug('props lookup for fetchMessages threw:', error)
		}
	}

	if (!actions) {
		console.error(
			'[CatchUp] no fetchMessages found; only cached messages can be summarised',
		)
	}

	return actions
}

function rawMessages(channelId: string): any[] {
	try {
		const store = (revenge.discord.flux.Stores as any)?.MessageStore
		const result = store?.getMessages?.(channelId)
		return (
			result?._array ??
			result?.toArray?.() ??
			(Array.isArray(result) ? result : [])
		)
	} catch {
		return []
	}
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

export interface BackfillResult {
	/** Raw messages in the store afterwards. */
	loaded: number
	/** True when the channel ran out of history rather than us running out of patience. */
	exhausted: boolean
	/** True when no fetch could be made at all. */
	unavailable: boolean
}

/**
 * Loads pages until the store holds at least `want` raw messages.
 *
 * `want` is counted in raw messages, not usable ones: filtering happens afterwards and its ratio
 * is not knowable in advance, so this over-fetches slightly rather than looping on a moving
 * target.
 */
export async function backfill(
	channelId: string,
	want: number,
): Promise<BackfillResult> {
	let loaded = rawMessages(channelId).length
	if (loaded >= want) return { loaded, exhausted: false, unavailable: false }

	const host = getActions()
	if (!host) return { loaded, exhausted: false, unavailable: true }

	for (let page = 0; page < MAX_PAGES && loaded < want; page++) {
		const current = rawMessages(channelId)
		// The store is newest-last, so the oldest loaded message is the cursor to page back from.
		const oldest = current[0]?.id
		if (!oldest) break

		try {
			host.fetchMessages({
				channelId,
				before: oldest,
				limit: Math.min(PAGE_SIZE, want - loaded),
			})
		} catch (error) {
			debug('fetchMessages threw:', error)
			break
		}

		// Wait for the store to actually grow rather than trusting the call's return value.
		const deadline = Date.now() + PAGE_TIMEOUT_MS
		let grown = loaded
		while (Date.now() < deadline) {
			await wait(POLL_MS)
			grown = rawMessages(channelId).length
			if (grown > loaded) break
		}

		if (grown <= loaded) {
			// Nothing arrived: either the channel has no more history, or the request failed.
			// Both mean stopping, and neither is worth another four seconds to distinguish.
			debug(`backfill stopped at ${loaded} messages after page ${page + 1}`)
			return { loaded, exhausted: true, unavailable: false }
		}

		loaded = grown
		debug(`backfill page ${page + 1}: ${loaded} messages loaded`)
	}

	return { loaded, exhausted: false, unavailable: false }
}
