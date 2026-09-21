/**
 * Finds a module by props now or whenever it initializes, and hands it over once.
 *
 * `lookupModule` alone is one-shot over modules already initialized, and the message and reply
 * action creators are often not initialized at `start()` -- porting rule 3, and the exact bug
 * that kept Catch Up's slash command from registering. This pairs the lookup with a subscription
 * rather than using `getModules`, whose `max` is shared between its two halves.
 *
 * The export is checked on both the namespace and `default` (porting rule 3 again).
 */
export function whenModule(
	props: string[],
	onFound: (host: any, id: number) => void,
): () => void {
	const { lookupModules, waitForModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters
	const filter = withProps(props[0], ...props.slice(1))

	let done = false
	const accept = (exports: any, id: number) => {
		if (done) return false
		const key = props[0]
		const host =
			typeof exports?.[key] === 'function' ? exports : exports?.default
		if (typeof host?.[key] !== 'function') return false
		done = true
		onFound(host, id)
		return true
	}

	for (const [exports, id] of lookupModules(filter)) {
		if (accept(exports, id as number)) return () => {}
	}

	// Declared first because the callback references it.
	let unsub: (() => void) | undefined
	unsub = waitForModules(filter, (exports: any, id: number) => {
		if (accept(exports, id)) unsub?.()
	})
	return () => unsub?.()
}
