import { OFFERED_MESSAGE_EFFECTS } from "./messageEffects"
import type { NativeState } from "../native"
import { EFFECT_OPTIONS, FILTER_OPTIONS, PARTICLE_OPTIONS } from "../ui/options"
import { refreshNative, watchNative } from "../ui/state"

/** Finger effects need a finger held down, so a spell never plays them. */
const FINGER = new Set(["lens", "jelly", "blackhole"])

export interface SpellOption {
	/** `filter:crt`, `effect:ripple`, `particles:hearts` or `message:slam`: what SpellRules in native matches. */
	id: string
	label: string
	/** False when this phone can't show it right now (a spell skips it anyway). */
	available: boolean
}

export interface SpellGroup {
	title: string
	options: SpellOption[]
}

let latest: NativeState | null = null

function spellGroups(): SpellGroup[] {
	const cap = (kind: "effects" | "filters", id: string) =>
		(latest?.[kind] as Record<string, { available: boolean }> | undefined)?.[id]?.available !== false
	return [
		{
			title: "Screen filters",
			options: FILTER_OPTIONS.filter(o => o.value !== "none").map(o => ({
				id: `filter:${o.value}`,
				label: o.label,
				available: cap("filters", o.value),
			})),
		},
		{
			title: "Screen effects",
			options: EFFECT_OPTIONS.filter(o => o.value !== "none" && !FINGER.has(o.value)).map(o => ({
				id: `effect:${o.value}`,
				label: o.label,
				available: cap("effects", o.value),
			})),
		},
		{
			title: "Particles",
			options: PARTICLE_OPTIONS.filter(o => o.value !== "none").map(o => ({
				id: `particles:${o.value}`,
				label: o.label,
				available: true,
			})),
		},
		{
			title: "Message effects",
			options: OFFERED_MESSAGE_EFFECTS.map(e => ({
				id: `message:${e.value}`,
				label: e.label,
				available: latest?.messageCapabilities?.[e.value] !== false,
			})),
		},
	]
}

/**
 * `globalThis.__bleelblepVfxSpells()`: everything a Shimeji spell can show, grouped and named, for
 * Shimeji's spell list. Only JS knows the names, and Shimeji can't import another plugin's code.
 */
export function registerSpellOptions(): () => void {
	const g = globalThis as any
	const stop = watchNative(state => {
		latest = state
	})
	refreshNative()
	g.__bleelblepVfxSpells = spellGroups
	return () => {
		stop()
		if (g.__bleelblepVfxSpells === spellGroups) delete g.__bleelblepVfxSpells
	}
}
