/**
 * Repainting chat rows through Discord's own pipeline.
 *
 * On builds where `DCDChatManager` is unreachable the mirror replay is dead, and the only
 * way to regenerate rows without a channel switch is to make Discord's own message pipeline
 * do it: dispatching a `MESSAGE_UPDATE` for each cached message causes `MessageStore` to
 * re-emit and the chat to regenerate the row through `RowManager.generate`.
 *
 * Some stores subscribed to `MESSAGE_UPDATE` throw on the payload — that is caught, and the
 * dispatches that fail are noise; the ones that reach `MessageStore` are the ones that
 * matter.
 *
 * Technique adapted from HideBlockedAndIgnoredMessages (Zykrah, シグマ siguma).
 */

const MAX_DISPATCHES = 50

let shapeLogged = false

export function rerenderViaFlux(): string {
	let Dispatcher: any
	let stores: any
	try {
		Dispatcher = (revenge.discord.common as any)?.flux?.Dispatcher
		stores = (revenge.discord.flux as any)?.Stores
	} catch {
		return "Flux dispatcher unavailable"
	}

	if (typeof Dispatcher?.dispatch !== "function") return "Flux dispatcher unavailable"

	let channelId: unknown
	try {
		channelId = stores?.SelectedChannelStore?.getChannelId?.()
	} catch {
		return "channel store unreadable"
	}
	if (typeof channelId !== "string" || !channelId) return "no channel open"

	let cache: any
	try {
		cache = stores?.MessageStore?.getMessages?.(channelId)
	} catch {
		return "message cache unreadable"
	}
	if (!cache) return "message cache unavailable"

	const messages: any[] = []
	try {
		if (Array.isArray(cache)) messages.push(...cache)
		else if (Array.isArray(cache._array)) messages.push(...cache._array)
		else if (typeof cache.forEach === "function") cache.forEach((m: any) => messages.push(m))
	} catch {
		return "message cache unreadable"
	}

	if (messages.length === 0) return "no cached messages"

	if (!shapeLogged) {
		shapeLogged = true
		try {
			const raw = typeof messages[0]?.toJS === "function" ? messages[0].toJS() : messages[0]
			console.log(`[ScreenshotRedactor] cached message keys: ${Object.keys(raw ?? {}).sort().join(" ")}`)
		} catch {
			/* shape logging must never break the repaint */
		}
	}

	let dispatched = 0
	let rejected = 0

	for (const message of messages.slice(-MAX_DISPATCHES)) {
		if (!message || typeof message.id !== "string") continue

		try {
			const result = Dispatcher.dispatch({
				type: "MESSAGE_UPDATE",
				message: typeof message.toJS === "function" ? message.toJS() : message,
			})
			result?.catch?.((_error: unknown) => { rejected++ })
			dispatched++
		} catch {
			rejected++
		}
	}

	if (rejected > 0) {
		console.log(`[ScreenshotRedactor] ${rejected}/${dispatched} MESSAGE_UPDATE rejected by other handlers`)
	}

	return dispatched > 0
		? `asked Discord to regenerate ${dispatched} messages (${dispatched - rejected} ok)`
		: "nothing dispatchable in the cache"
}
