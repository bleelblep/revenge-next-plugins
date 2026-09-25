/**
 * The interception.
 *
 * ## Why `sendMessage` and not the send button
 *
 * Every route into the outbox -- the button, the return key, a slash command's follow-up, the
 * share sheet -- ends at the same action creator. Hooking the chat input's submit handler would
 * cover the button and miss the rest, and the component moves between Discord builds while the
 * action creator does not.
 *
 * It is also early enough to matter: the optimistic message row is created *inside* `sendMessage`,
 * so refusing here means nothing is ever drawn in the channel, not even for a frame.
 *
 * ## A plain wrapper, not a patcher `instead`
 *
 * The guard has to be able to decline to call the original, which a patcher `before` cannot do. It
 * used to be a patcher `instead`, and that made sending fail with "Maximum call stack size exceeded"
 * for some people: fake-nitro and Zipline also `instead`-hook `sendMessage`, and when any plugin had
 * put a `before` or `after` on it first (Send Tweaks did, up to 0.2.0), the patcher's two-`instead`
 * bug made the chain call itself forever (docs/debugging/api-contracts.md). Reproduced against the
 * patcher's source.
 *
 * So `sendMessage` is replaced with a plain function that runs the guard and calls what was there
 * before. A plain function is not a patcher proxy, so it cannot be part of that loop, and it breaks
 * the loop even when another plugin's hooks were there first. Send Tweaks does the same
 * (`lib/wrap.ts` there).
 *
 * ## The fast path stays synchronous
 *
 * A clean message must reach `original` on the same tick it arrived, with no promise in between.
 * Only a draft the local gate has already flagged is allowed to wait on the network.
 */

import { restoreDraft } from '../lib/draft'
import { judgeLocally, judgeRemotely } from '../lib/judge'
import { debug, recordSend, snooze, TAG, toast } from '../lib/state'
import { openHoldAlert } from '../ui/components/HoldAlert'
import type { Verdict } from '../types'

const HOUR = 60 * 60 * 1000

/** Reported on the Debug page. An uninstalled hook means nothing is being checked at all. */
const status = { installed: false, moduleId: -1 }

export function hookStatus(): { installed: boolean; moduleId: number } {
	return { ...status }
}

export default function patchSendMessage(): () => void {
	const cleanups: Array<() => void> = []
	let installed = false
	let stopped = false

	const { lookupModules, waitForModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	// Narrow enough to land on the message action creators and nothing else.
	const filter = withProps('sendMessage', 'editMessage', 'startEditMessage')

	const install = (exports: any, id: number) => {
		if (installed || stopped) return

		// The export is usually on `default`, not on the namespace -- porting rule 3.
		const host =
			typeof exports?.sendMessage === 'function' ? exports : exports?.default
		if (typeof host?.sendMessage !== 'function') return

		const unwrap = wrapSendMessage(host)
		if (!unwrap) return
		cleanups.push(unwrap)
		installed = true
		status.installed = true
		status.moduleId = id
		// Log the outcome, not the attempt -- porting rule 3.
		console.log(`${TAG} guarding sendMessage on module ${id}`)
	}

	try {
		for (const [exports, id] of lookupModules(filter))
			install(exports, id as number)
	} catch (error) {
		console.error(`${TAG} sendMessage lookup failed:`, error)
	}

	if (!installed) {
		// The chat modules are often not initialized yet at start(). Rule 3: pair the one-shot
		// lookup with a subscription rather than reaching for getModules, whose `max` is spent
		// by the lookup half before the subscription is ever created.
		try {
			// `unsub` is declared first because the callback references it. waitForModules only
			// fires on future initializations, so it cannot run before the assignment -- but a
			// const here would be one upstream change away from a temporal-dead-zone throw.
			let unsub: (() => void) | undefined
			unsub = waitForModules(filter, (exports: any, id: number) => {
				install(exports, id)
				if (installed) unsub?.()
			})
			cleanups.push(() => unsub?.())
		} catch (error) {
			console.error(`${TAG} could not subscribe for sendMessage:`, error)
		}
	}

	return () => {
		stopped = true
		status.installed = false
		status.moduleId = -1
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch (error) {
				console.error(`${TAG} cleanup failed:`, error)
			}
		}
	}
}

/**
 * Replaces `host.sendMessage` with a plain function that runs `guard`. Returns the undo, or undefined
 * when the property would not take the new function. Undo puts the original back only if nothing
 * has wrapped it since; otherwise the wrapper stays and just passes every send straight through.
 */
function wrapSendMessage(host: any): (() => void) | undefined {
	const original = host.sendMessage
	let active = true
	const wrapper = function (this: unknown, ...args: any[]) {
		if (!active) return Reflect.apply(original, this, args)
		try {
			return guard.call(this, args, original)
		} catch (error) {
			// The guard handles its own failures and sends; reaching here means something threw
			// before it could. Fail open, as everywhere else: the check must never cost a message.
			console.error(`${TAG} guard threw; sending anyway:`, error)
			return Reflect.apply(original, this, args)
		}
	}
	host.sendMessage = wrapper
	if (host.sendMessage !== wrapper) {
		console.error(`${TAG} could not wrap sendMessage`)
		return undefined
	}
	return () => {
		active = false
		if (host.sendMessage === wrapper) host.sendMessage = original
	}
}

function guard(this: any, args: any[], original: any) {
	// A captured original is not guaranteed callable -- porting rule 2.
	if (typeof original !== 'function') return undefined

	const send = () => {
		recordSend()
		return Reflect.apply(original, this, args)
	}

	const channelId: string = args?.[0]
	const content = args?.[1]?.content

	// Anything that is not a plain text message -- an attachment-only send, a sticker, a shape
	// this plugin does not recognise -- goes straight out.
	if (typeof channelId !== 'string' || typeof content !== 'string')
		return send()

	let outcome: ReturnType<typeof judgeLocally>
	try {
		outcome = judgeLocally(content, channelId)
	} catch (error) {
		// The guard failing must never cost the user a message.
		console.error(`${TAG} local check threw; sending anyway:`, error)
		return send()
	}

	if (outcome.kind === 'pass') return send()

	if (outcome.kind === 'hold') {
		hold(outcome.verdict, channelId, content, send)
		return Promise.resolve(undefined)
	}

	// --- the paid path --------------------------------------------------------
	// A toast only if the wait becomes noticeable. Most calls come back fast enough that
	// announcing them would be worse than staying quiet.
	let announced = false
	const announce = setTimeout(() => {
		announced = true
		toast('Reading that back…')
	}, 700)

	judgeRemotely(content, outcome.categories)
		.then(verdict => {
			clearTimeout(announce)
			if (!verdict.hold) {
				debug(announced ? 'model passed it (late)' : 'model passed it')
				send()
				return
			}
			hold(verdict, channelId, content, send)
		})
		.catch(error => {
			// judgeRemotely swallows its own failures, so this is a bug in our own code rather
			// than a network problem. Still fail open.
			clearTimeout(announce)
			console.error(`${TAG} remote check threw; sending anyway:`, error)
			send()
		})

	return Promise.resolve(undefined)
}

function hold(
	verdict: Verdict,
	channelId: string,
	content: string,
	send: () => unknown,
) {
	debug(`held: ${verdict.category} (${verdict.source}) -- ${verdict.reason}`)

	// Hushing the credential check for an hour is never something anyone wants, so that button
	// is only offered on the judgement calls.
	const tierOne =
		verdict.category !== 'credentials' && verdict.category !== 'personal'

	openHoldAlert({
		verdict,
		onSend: () => void send(),
		onEdit: () => restoreDraft(channelId, content),
		onSnooze: tierOne
			? () => {
					snooze(HOUR)
					toast('Quiet for an hour')
					void send()
				}
			: undefined,
	})
}
