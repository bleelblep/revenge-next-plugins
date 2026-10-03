/**
 * The message's length, handed from Discord's counter (`lib/counter.ts`, which hears every change)
 * to the square above the message box (`lib/badge.tsx`, drawn by the chat input). One chat input is
 * on screen at a time, so module state is enough.
 */

let length = 0
const listeners = new Set<() => void>()

export function setLength(value: number) {
	const next = typeof value === 'number' && value > 0 ? value : 0
	if (next === length) return
	length = next
	for (const listener of listeners) {
		try {
			listener()
		} catch {
			/* one broken listener must not stop the rest */
		}
	}
}

/** The current length, re-rendering on change. Call like a hook. */
export function useLength(): number {
	const React = revenge.react.React
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(redraw)
		return () => {
			listeners.delete(redraw)
		}
	}, [])
	return length
}

let maxLength: (() => number) | undefined

/** Discord's own limit for this account: 2000, or 4000 with Nitro. */
export function limit(): number {
	if (!maxLength) {
		try {
			const { lookupModule } = revenge.modules.finders
			const { withProps } = revenge.modules.finders.filters
			const mod = lookupModule<any>(withProps('getMaxMessageLength'))?.[0]
			const host = typeof mod?.getMaxMessageLength === 'function' ? mod : mod?.default
			if (typeof host?.getMaxMessageLength === 'function') maxLength = () => host.getMaxMessageLength()
		} catch {
			/* fall back below */
		}
	}
	try {
		const value = maxLength?.()
		if (typeof value === 'number' && value > 0) return value
	} catch {
		/* fall back below */
	}
	return 2000
}
