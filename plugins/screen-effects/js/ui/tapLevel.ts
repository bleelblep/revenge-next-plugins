import type { ScreenEffectsStorage } from "../native"

/**
 * The Tap effects slider: Off, then four strengths. Off is `onTap: false`, with strength put back
 * to Normal, so sends, mentions and power mode (which share the strength) keep a sensible one.
 * Native snaps any saved strength to the nearest of these, so older free-slider values land here.
 */
export const TAP_LEVELS = [
	{ label: "Off", subLabel: "Taps do nothing. Sends, mentions, /fx and power mode still play.", intensity: 0.6 },
	{ label: "Subtle", subLabel: "A gentle bend and a few particles.", intensity: 0.3 },
	{ label: "Normal", subLabel: "The default.", intensity: 0.6 },
	{ label: "Strong", subLabel: "The screen bends harder and more particles fly.", intensity: 1.2 },
	{ label: "Overboard", subLabel: "Everything at full blast, with extra particles. Heavier on the GPU.", intensity: 3 },
] as const

/** The slider position for the saved settings. */
export function tapLevel(s: Pick<ScreenEffectsStorage, "onTap" | "intensity">): number {
	if (!s.onTap) return 0
	let best = 1
	for (let i = 1; i < TAP_LEVELS.length; i++) {
		if (Math.abs(TAP_LEVELS[i].intensity - s.intensity) < Math.abs(TAP_LEVELS[best].intensity - s.intensity)) best = i
	}
	return best
}

/** The settings patch for a slider position. */
export function tapLevelPatch(level: number): Pick<ScreenEffectsStorage, "onTap" | "intensity"> {
	const i = Math.max(0, Math.min(TAP_LEVELS.length - 1, Math.round(level)))
	return { onTap: i > 0, intensity: TAP_LEVELS[i].intensity }
}
