/**
 * Sending a long message as several, with a wait between them.
 *
 * `sendMessage` is where every route into the outbox ends (the button, the return key, the share
 * sheet), so that is what is wrapped: a plain function in place of the method, as Send Tweaks and
 * Second Thoughts do, never a patcher `instead` -- two `instead` hooks on one method recurse
 * (docs/debugging/api-contracts.md). Whatever else wraps `sendMessage` keeps working: when another
 * plugin's wrapper is outside ours it sees the whole text, inside ours it sees each part.
 *
 * ## Discord refuses first, unless the limit it checks is raised
 *
 * Pressing send runs `chatInputHandleSendText` -> `chatInputValidateContentLength`, which calls
 * `getMaxMessageLength()` (module `useMessageMaxLength` / `getMaxMessageLength`, 351.3; found by
 * tracing the call on the device) and refuses over-limit text before `sendMessage` is ever
 * reached. So while splitting is on, that export is wrapped to report `limit x max parts`; the
 * real function is handed to `lib/length.ts`, which is where this plugin takes its cut from. Text
 * beyond even the raised limit still reaches `sendMessage`, is sent as typed, and Discord's server
 * says it is too long -- as the settings page says.
 *
 * A message within the limit goes straight through, on the same tick, untouched. Past it, the text
 * is cut (`lib/split.ts`); the first part goes out through the original call with everything the
 * message carried (reply, attachments, allowed mentions), and the rest follow as plain text
 * messages, each after the wait -- the setting, or the channel's slowmode when that is longer.
 * Parts go out in order: each one waits for the previous send to settle first.
 *
 * If a later part fails, whatever has not been sent goes back into the message box (Discord's own
 * `saveDraft`, else a `DRAFT_CHANGE` dispatch) and a toast says so, since by then the box is empty
 * and the caller has long had its answer. The wrapper itself never throws: any failure in the
 * planning sends the message exactly as typed.
 */

import { Dispatcher } from '@revenge-mod/discord/common/flux'
import { Stores } from '@revenge-mod/discord/flux'
import * as finders from '@revenge-mod/modules/finders'
import * as filters from '@revenge-mod/modules/finders/filters'
import { reportError } from '../../../../shared/report'
import { showToast } from '../../../../shared/toast'
import { SPLIT_DELAY, SPLIT_MAX } from '../index'
import { limit, setRealLimit } from './length'
import { splitMessage } from './split'
import type { CharCounterStorage } from '../index'

const TAG = '[CharCounter]'
const DEBUG: boolean = false
/** Discord's DraftType.ChannelMessage. */
const CHANNEL_MESSAGE = 0

export const splitStatus = {
	installed: false,
	moduleId: -1,
	limitRaised: false,
	lastError: '',
	splits: 0,
	parts: 0,
}

/** The wait between parts, in seconds, clamped and on the slider's half-second steps. */
export function delaySecondsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitDelaySec)
	if (!Number.isFinite(value)) return SPLIT_DELAY.default
	return Math.min(
		SPLIT_DELAY.max,
		Math.max(
			SPLIT_DELAY.min,
			Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step,
		),
	)
}

/** The most parts a message may be split into, clamped. */
export function maxPartsOf(s: Partial<CharCounterStorage>): number {
	const value = Number(s.splitMax)
	return Number.isFinite(value)
		? Math.min(SPLIT_MAX.max, Math.max(SPLIT_MAX.min, Math.round(value)))
		: SPLIT_MAX.default
}

interface Plan {
	channelId: string
	message: any
	parts: string[]
	delayMs: number
}

export function patchSplit(settings: () => CharCounterStorage): () => void {
	const unpatchLimit = patchLimit(settings)
	const unpatchSend = patchSend(settings)
	return () => {
		unpatchSend()
		unpatchLimit()
	}
}

/**
 * Wraps `getMaxMessageLength` so Discord's own send validation allows `limit x max parts` while
 * splitting is on. The hook export (`default`, `useMessageMaxLength`) is left alone: it was not on
 * the send path when traced, and Discord's counter drawing is dropped by `lib/counter.tsx` anyway.
 */
function patchLimit(settings: () => CharCounterStorage): () => void {
	const { lookupModules, waitForModules } = finders
	const { withProps } = filters
	const filter = withProps('getMaxMessageLength')
	const cleanups: Array<() => void> = []
	let stopped = false

	const install = (exports: any, id: number): boolean => {
		if (splitStatus.limitRaised || stopped) return false
		const host = typeof exports?.getMaxMessageLength === 'function' ? exports : exports?.default
		if (typeof host?.getMaxMessageLength !== 'function') return false
		const original = host.getMaxMessageLength
		let active = true
		const wrapper = function (this: unknown, ...args: any[]) {
			const real = Reflect.apply(original, this, args)
			if (!active || typeof real !== 'number') return real
			const s = settings()
			return s.split ? real * maxPartsOf(s) : real
		}
		host.getMaxMessageLength = wrapper
		if (host.getMaxMessageLength !== wrapper) {
			splitStatus.lastError = 'getMaxMessageLength is read-only'
			return false
		}
		setRealLimit(() => Reflect.apply(original, host, []))
		splitStatus.limitRaised = true
		if (DEBUG) console.log(`${TAG} raising the validated limit on module ${id}`)
		cleanups.push(() => {
			active = false
			setRealLimit(undefined)
			if (host.getMaxMessageLength === wrapper) host.getMaxMessageLength = original
		})
		return true
	}

	try {
		for (const [exports, id] of lookupModules(filter)) if (install(exports, id as number)) break
	} catch (error) {
		splitStatus.lastError = `limit lookup: ${(error as Error)?.message ?? error}`
	}
	if (!splitStatus.limitRaised) {
		let unsub: (() => void) | undefined
		unsub = waitForModules(filter, (exports: any, id: number) => {
			if (install(exports, id)) unsub?.()
		})
		cleanups.push(() => unsub?.())
	}

	return () => {
		stopped = true
		splitStatus.limitRaised = false
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}

function patchSend(settings: () => CharCounterStorage): () => void {
	const { lookupModules, waitForModules } = finders
	const { withProps } = filters
	// Narrow enough to land on the message action creators and nothing else.
	const filter = withProps('sendMessage', 'editMessage', 'startEditMessage')
	const cleanups: Array<() => void> = []
	let stopped = false

	const install = (exports: any, id: number): boolean => {
		if (splitStatus.installed || stopped) return false
		// The export is usually on `default`, not on the namespace -- porting rule 3.
		const host =
			typeof exports?.sendMessage === 'function' ? exports : exports?.default
		if (typeof host?.sendMessage !== 'function') return false
		const unwrap = wrap(host, settings)
		if (!unwrap) return false
		cleanups.push(unwrap)
		splitStatus.installed = true
		splitStatus.moduleId = id
		// The outcome, not the attempt -- porting rule 3.
		if (DEBUG) console.log(`${TAG} splitting long messages on module ${id}`)
		return true
	}

	try {
		for (const [exports, id] of lookupModules(filter))
			if (install(exports, id as number)) break
	} catch (error) {
		splitStatus.lastError = `lookup: ${(error as Error)?.message ?? error}`
	}
	if (!splitStatus.installed) {
		// Often not initialized yet at start(): a subscription alongside the one-shot lookup, not
		// getModules, whose `max` the lookup half would use up (porting rule 3).
		let unsub: (() => void) | undefined
		unsub = waitForModules(filter, (exports: any, id: number) => {
			if (install(exports, id)) unsub?.()
		})
		cleanups.push(() => unsub?.())
	}

	return () => {
		stopped = true
		splitStatus.installed = false
		splitStatus.moduleId = -1
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
	}
}

/**
 * Replaces `host.sendMessage` with the plain wrapper. Undo puts the original back only if nothing
 * has wrapped it since; otherwise the wrapper stays and passes every send straight through.
 */
function wrap(
	host: any,
	settings: () => CharCounterStorage,
): (() => void) | undefined {
	const original = host.sendMessage
	let active = true
	const wrapper = function (this: unknown, ...args: any[]) {
		if (active) {
			try {
				const plan = planSplit(args, settings())
				if (plan) return sendParts.call(this, original, args, plan)
			} catch (error) {
				// Never stand between the user and the send: it goes ahead exactly as typed.
				splitStatus.lastError = `split: ${(error as Error)?.message ?? error}`
				reportError(`${TAG} splitting failed; sending as typed:`, error)
			}
		}
		return Reflect.apply(original, this, args)
	}
	host.sendMessage = wrapper
	if (host.sendMessage !== wrapper) {
		splitStatus.lastError = 'sendMessage is read-only'
		reportError(`${TAG} could not wrap sendMessage`)
		return undefined
	}
	return () => {
		active = false
		if (host.sendMessage === wrapper) host.sendMessage = original
	}
}

/** The parts and the wait, or undefined when this send is to go out as it is. */
function planSplit(args: any[], s: CharCounterStorage): Plan | undefined {
	if (!s.split) return undefined
	const channelId = args[0]
	const message = args[1]
	const content = message?.content
	if (typeof channelId !== 'string' || typeof content !== 'string')
		return undefined
	const max = limit()
	if (content.length <= max) return undefined

	const parts = splitMessage(content, max)
	if (parts.length <= 1) return undefined
	if (parts.length > maxPartsOf(s)) {
		// Sent as typed: Discord then says it is too long, as it would without this plugin.
		showToast(
			`That's ${parts.length} messages' worth; the most it splits into is ${maxPartsOf(s)}`,
		)
		return undefined
	}
	return {
		channelId,
		message,
		parts,
		delayMs: Math.max(delaySecondsOf(s), slowmodeSeconds(channelId)) * 1000,
	}
}

function sendParts(this: unknown, original: any, args: any[], plan: Plan) {
	const { channelId, message, parts, delayMs } = plan
	// The first part carries everything the message had: the reply, attachments, allowed mentions.
	const first = Reflect.apply(original, this, [
		channelId,
		{ ...message, content: parts[0] },
		...args.slice(2),
	])
	splitStatus.splits++
	splitStatus.parts += parts.length
	showToast(`Sending as ${parts.length} messages`)
	void (async () => {
		let sent = 0
		try {
			await settle(first)
			sent = 1
			for (const part of parts.slice(1)) {
				await sleep(delayMs)
				// Plain text, the shape Discord's own follow-up sends use.
				await settle(
					Reflect.apply(original, this, [
						channelId,
						{
							content: part,
							tts: false,
							invalidEmojis: [],
							validNonShortcutEmojis: [],
						},
						undefined,
						{},
					]),
				)
				sent++
			}
			if (DEBUG)
				console.log(`${TAG} sent ${parts.length} parts, ${delayMs} ms apart`)
		} catch (error) {
			reportError(`${TAG} part ${sent + 1} of ${parts.length} failed:`, error)
			const left = parts.slice(Math.max(sent, 1)).join('\n\n')
			if (left) {
				restoreDraft(channelId, left)
				showToast(
					`Part ${sent + 1} of ${parts.length} didn't send. The rest is back in the message box.`,
				)
			}
		}
	})()
	return first
}

/** Waits for a send's result; a rejected promise or an `ok: false` reply counts as a failure. */
async function settle(result: any): Promise<void> {
	const value =
		result && typeof result.then === 'function' ? await result : result
	if (value && typeof value === 'object' && value.ok === false)
		throw new Error(`HTTP ${value.status ?? '?'}`)
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, Math.max(0, ms)))
}

/** The channel's slowmode in seconds, or 0. */
function slowmodeSeconds(channelId: string): number {
	try {
		const seconds = (Stores as any).ChannelStore?.getChannel?.(
			channelId,
		)?.rateLimitPerUser
		return typeof seconds === 'number' && seconds > 0 ? seconds : 0
	} catch {
		return 0
	}
}

let draftHost: any
let draftLooked = false

/** Puts `content` back in the channel's message box: `saveDraft`, else a `DRAFT_CHANGE` dispatch. */
function restoreDraft(channelId: string, content: string) {
	try {
		if (!draftLooked) {
			draftLooked = true
			const { lookupModule } = finders
			const { withProps } = filters
			const mod = lookupModule<any>(withProps('saveDraft', 'clearDraft'))?.[0]
			draftHost = typeof mod?.saveDraft === 'function' ? mod : mod?.default
		}
		if (typeof draftHost?.saveDraft === 'function') {
			draftHost.saveDraft(channelId, CHANNEL_MESSAGE, content)
			return
		}
	} catch (error) {
		if (DEBUG) console.log(`${TAG} saveDraft failed:`, error)
	}
	try {
		;(Dispatcher as any).dispatch({
			type: 'DRAFT_CHANGE',
			channelId,
			draftType: CHANNEL_MESSAGE,
			draft: content,
		})
	} catch (error) {
		reportError(`${TAG} could not put the unsent text back:`, error)
	}
}
