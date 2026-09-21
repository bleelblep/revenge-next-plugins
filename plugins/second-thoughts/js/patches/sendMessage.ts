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
 * ## Why `instead`
 *
 * `before` can rewrite arguments but cannot decline to call the original, and declining is the
 * entire feature. Nothing else in this repo patches `sendMessage`, so the two-`instead` recursion
 * trap in porting rule 2 does not apply -- but that is a fact about this repo, and it has to be
 * rechecked before any other plugin here touches this method.
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

		cleanups.push(revenge.patcher.instead(host, 'sendMessage', guard))
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
