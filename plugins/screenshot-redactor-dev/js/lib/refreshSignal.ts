let revision = 0
const listeners = new Set<() => void>()
let pendingRefresh: ReturnType<typeof setTimeout> | undefined

export function cancelScheduledRefresh() {
	if (pendingRefresh !== undefined) clearTimeout(pendingRefresh)
	pendingRefresh = undefined
}

export function scheduleRefresh(refresh: () => void) {
	cancelScheduledRefresh()
	pendingRefresh = setTimeout(() => {
		pendingRefresh = undefined
		refresh()
	}, 0)
}

/** Also refreshes on alias reset, which changes presentation without changing stored settings. */
export function notifyPresentationRefresh() {
	revision++
	for (const listener of listeners) {
		try { listener() } catch (error) {
			console.error("[ScreenshotRedactor] presentation refresh failed:", error)
		}
	}
}

export function usePresentationRefresh() {
	revenge.react.React.useSyncExternalStore(
		listener => {
			listeners.add(listener)
			return () => { listeners.delete(listener) }
		},
		() => revision,
	)
}
