import renderTimestamp, { type TimestampStorage } from "../lib/renderTimestamp"

// This runs inside RowManager.generate, i.e. on the chat render path. Anything that
// escapes here crashes the entire ChatView, so the whole body is guarded.
//
// getModules, not lookupModule: confirmed on-device (staff-tags plugin, getTagProperties)
// that a chat-UI-related module can still be unloaded even from inside start() on a cold
// app restart -- it only initializes once the chat screen actually renders. lookupModule
// gives up immediately and permanently caches that as "not found"; getModules subscribes
// and calls back whenever the module actually loads.
export default function patchRowManager(jsonStorage: RevengeJsonStorageApi<TimestampStorage>): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	let unpatchBefore: (() => void) | undefined
	let unpatchAfter: (() => void) | undefined

	const unsubscribe = getModules<any>(withName("RowManager"), RowManager => {
		if (!RowManager?.prototype?.generate) {
			console.error("[CustomTimestamps] RowManager.prototype.generate not found")
			return
		}

		// A before-hook MUST return the args array. revenge-bundle-next's applyHooks
		// (lib/patcher/src/_internal.ts) does `arg = hook(arg)` with no `?? arg` fallback, so
		// returning nothing sets args to undefined for every hook after this one -- here that
		// fed `undefined` to the instead-hook below, whose `original(...args)` then blew up as
		// "TypeError: Cannot convert undefined value to object" at Hermes' arraySpread, taking
		// the whole ChatView down. Same family as the `after`-signature bug noted below: this
		// patcher's hook contracts differ from classic Revenge/Vendetta's.
		unpatchBefore = revenge.patcher.before(RowManager.prototype, "generate", (args: any[]) => {
			const [row] = args
			try {
				const { selected, customFormat } = jsonStorage.cache
				if (row?.rowType === 1) {
					if (jsonStorage.cache.separateMessages) row.isFirst = true
					if (row.message?.timestamp) {
						row.message.__customTimestamp = renderTimestamp(row.message.timestamp, selected, customFormat)
					}
				}
				// "day" separator rows (row.text, e.g. "Today"/"Yesterday"/a date) aren't
				// reformatted here: Discord hands us that text already rendered, and there's
				// no reliable way to parse it back into a Date without moment.js (which
				// doesn't exist on revenge.discord.common -- see renderTimestamp.ts). The
				// per-message timestamp above is the primary feature and is unaffected.
			} catch (error) {
				console.error("[CustomTimestamps] generate hook failed:", error)
			}
			// Outside the try on purpose: the args must survive even if the body above threw.
			return args
		})

		// instead, not after: after's hook only receives the return value, not the original
		// arguments (confirmed from revenge-bundle-next's own patcher source) -- we need
		// `row` (from the args) to know whether __customTimestamp was set by the before-hook
		// above. instead gives us both the args and a way to call the real implementation.
		//
		// A plain `function`, NOT an arrow, and `Reflect.apply(original, this, args)`, NOT
		// `original(...args)`: `generate` is a prototype method, so it needs its receiver. The
		// patcher's apply trap invokes the instead-hook via
		// `Reflect.apply(hook, receiver, [args, original])` (lib/patcher/src/_internal.ts), so
		// the correct `this` is handed to the hook -- but an arrow function discards it, and
		// calling `original(...)` bare then runs `generate` with `this === undefined`. That
		// surfaced as "TypeError: Cannot read property 'options' of undefined" thrown from
		// Discord's own code, several frames below ours. This is the pattern PalmDevs' own
		// plugins use.
		unpatchAfter = revenge.patcher.instead(RowManager.prototype, "generate", function (
			this: any,
			args: any[],
			original: any,
		) {
			// Confirmed on-device crash elsewhere (staff-tags): "undefined is not a function"
			// when the captured original wasn't actually a function yet at patch time. Never
			// assume it's callable.
			if (typeof original !== "function") return undefined
			const ret: any = Reflect.apply(original, this, args)
			const [row] = args
			try {
				if (row?.rowType !== 1) return ret

				const message = ret?.message
				if (message && row.message?.__customTimestamp && message.state === "SENT" && message.timestamp) {
					message.timestamp = row.message.__customTimestamp
				}
			} catch (error) {
				console.error("[CustomTimestamps] generate return hook failed:", error)
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
