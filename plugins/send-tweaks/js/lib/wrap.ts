/**
 * Runs `beforeCall` on a method's arguments before every call, by replacing the method with a
 * plain function rather than hooking it through `revenge.patcher`.
 *
 * ## Why not `revenge.patcher.before`
 *
 * The methods this plugin touches (`sendMessage`, `editMessage`, `createPendingReply`) are ones
 * other plugins `instead`-hook: fake-nitro and Zipline on sending, fake-nitro and message-tweaks on
 * editing. The patcher has a bug with two `instead` hooks on one method: each one saves the method
 * as it was when it was added as its "original", and if that was already a patcher proxy -- because
 * a `before` was registered first -- the last hook in the chain calls back into the first, forever
 * (docs/debugging/api-contracts.md, "Two instead hooks on one method can recurse forever").
 *
 * So a patcher `before` that happened to start first made those plugins' pair of `instead` hooks
 * recurse, and saving an edit failed with "Maximum call stack size exceeded" -- only for people with
 * both installed, and only when this plugin started first. Reproduced against the patcher's source
 * (docs/debugging/conflicts.md, "editMessage").
 *
 * A plain function is not a proxy. An `instead` added after it saves it as an ordinary function, so
 * the chain always ends in real code, whatever order plugins start in and whatever else hooks the
 * method afterwards. It is also safe when added after them: it wraps whatever is there.
 *
 * ## Undoing it
 *
 * If the method is still this wrapper, the original is put back. If something has wrapped it since,
 * removing it would drop their hook too, so the wrapper stays and just stops doing anything.
 */
export function wrapMethod(
	host: any,
	key: string,
	beforeCall: (args: any[]) => void,
): () => void {
	const original = host?.[key]
	if (typeof original !== 'function') return () => {}

	let active = true
	const wrapper = function (this: unknown, ...args: any[]) {
		if (active) {
			try {
				beforeCall(args)
			} catch (error) {
				// Never stand between the user and the send: the call goes ahead unchanged.
				console.error(`[SendTweaks] ${key} rewrite failed:`, error)
			}
		}
		return original.apply(this, args)
	}
	host[key] = wrapper
	if (host[key] !== wrapper) {
		// A read-only property: nothing was installed, so there is nothing to undo.
		console.error(`[SendTweaks] could not wrap ${key}`)
		return () => {}
	}

	return () => {
		active = false
		if (host[key] === wrapper) host[key] = original
	}
}
