import { decode, type MessageEffect } from "./lib/messageEffects"
import * as flux from "@revenge-mod/discord/flux"
import { Stores } from "@revenge-mod/discord/flux"
import { reportError } from "../../../shared/report"

/**
 * The round-trip check for /fx: when Discord's server echoes back a message you sent with an
 * effect, did the hidden effect survive? That echo is exactly what other people receive, so this
 * answers "will my friends see it" without a second device.
 */
export interface RoundTrip {
	effect: MessageEffect
	survived: boolean
	at: number
}

let lastRoundTrip: RoundTrip | undefined
const roundTripListeners = new Set<(r: RoundTrip) => void>()

export function getRoundTrip(): RoundTrip | undefined {
	return lastRoundTrip
}

export function onRoundTrip(listener: (r: RoundTrip) => void): () => void {
	roundTripListeners.add(listener)
	return () => {
		roundTripListeners.delete(listener)
	}
}

function reportRoundTrip(result: RoundTrip) {
	lastRoundTrip = result
	for (const listener of roundTripListeners) listener(result)
}

/** At most one "getting" effect this often, so a busy DM doesn't strobe the screen. */
const RECEIVE_COOLDOWN_MS = 1500

/** Channel types for a one-to-one DM and a group DM. */
const DM_TYPES = new Set([1, 3])

function stores(): any {
	return Stores as any
}

function isOpen(channelId: string): boolean {
	return stores().SelectedChannelStore?.getChannelId?.() === channelId
}

function mentionsMe(message: any, me: string): boolean {
	return (message.mentions ?? []).some((m: any) => (typeof m === "string" ? m : m?.id) === me)
}

/**
 * Calls [fire] with "send" when you send a message, and "receive" when someone else's message
 * mentions you or arrives in a DM.
 *
 * A message carrying a message effect (see lib/messageEffects.ts) in the channel you have open
 * calls [playEffect] instead: yours as you send it, others' as they arrive. One effect per message,
 * never both.
 *
 * Your own messages sent from another device (Discord on your computer) play too, which is how you
 * test effects alone. The server echoes back every message you send from this phone as well, so
 * the nonce of each optimistic send is remembered and its echo is skipped, or it would play twice.
 *
 * Your own sends are recognised by Discord's optimistic MESSAGE_CREATE, the local copy dispatched
 * the moment you hit send (`optimistic`, or a message still in the SENDING state). The server's
 * echo of the same message, and messages you send from another device, are not optimistic, so
 * they never fire.
 */
export function watchMessages(
	fire: (kind: "send" | "receive") => void,
	playEffect: (effect: MessageEffect, mine: boolean) => void,
): () => void {
	const { onFluxEventDispatched } = flux
	let lastReceive = 0
	/** Nonces of messages sent from this phone, newest last; capped so it can't grow forever. */
	const sentHere: string[] = []
	/** Effects sent from this phone, by nonce, waiting for the server's echo. */
	const awaitingEcho = new Map<string, MessageEffect>()

	// A patch, not a listener: it MUST return the payload, or the message never shows.
	// See docs/porting-rules.md rule 2.
	return onFluxEventDispatched("MESSAGE_CREATE", (payload: any) => {
		try {
			const message = payload?.message
			const me = stores().UserStore?.getCurrentUser?.()?.id
			if (!message || !me) return payload

			const mine = message.author?.id === me
			const sending = mine && (payload.optimistic || message.state === "SENDING")
			const nonce = message.nonce ?? (sending ? message.id : undefined)
			if (sending && nonce) {
				sentHere.push(String(nonce))
				if (sentHere.length > 50) sentHere.shift()
			}
			const echo = mine && !sending && nonce != null && sentHere.includes(String(nonce))
			const otherDevice = mine && !sending && !echo

			const effect = decode(message.content)
			if (sending && nonce && effect) awaitingEcho.set(String(nonce), effect)
			if (echo && awaitingEcho.has(String(nonce))) {
				const sent = awaitingEcho.get(String(nonce))!
				awaitingEcho.delete(String(nonce))
				reportRoundTrip({ effect: sent, survived: effect === sent, at: Date.now() })
			}
			if (effect && (sending || otherDevice || !mine) && isOpen(payload.channelId)) {
				playEffect(effect, mine)
				return payload
			}

			if (mine) {
				if (sending) fire("send")
				return payload
			}

			const channel = stores().ChannelStore?.getChannel?.(payload.channelId)
			if (!mentionsMe(message, me) && !DM_TYPES.has(channel?.type)) return payload

			const now = Date.now()
			if (now - lastReceive < RECEIVE_COOLDOWN_MS) return payload
			lastReceive = now
			fire("receive")
		} catch (error) {
			reportError("[ScreenEffects] MESSAGE_CREATE handler failed:", error)
		}
		return payload
	})
}
