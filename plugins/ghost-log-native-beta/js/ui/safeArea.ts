/**
 * Bottom padding for a scrollable settings page, so the system gesture bar doesn't cover the
 * last card. Called like a hook (`useSafeAreaInsets` is one), so call it unconditionally at the
 * top of the component, and only ever from a render.
 */
export function useBottomPadding(base = 16): number {
	try {
		const mod = revenge.externals.ReactNativeSafeAreaContext as any
		const insets = mod?.useSafeAreaInsets?.()
		if (typeof insets?.bottom === 'number') return insets.bottom + base
	} catch {
		/* fall through to the base padding */
	}
	return base
}
