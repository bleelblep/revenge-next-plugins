import type { ComboSkin, EffectStyle, FilterStyle, ParticleStyle, PowerParticleStyle, NativeState, EffectCapability } from "../native"

export interface Option<T> {
	value: T
	label: string
	subLabel: string
}

const ALL_EFFECT_OPTIONS: Option<EffectStyle>[] = [
	{ value: "none", label: "None", subLabel: "No screen effect. Use this for particles on their own." },
	{
		value: "ripple",
		label: "Ripple",
		subLabel: "Soft waves spread across the whole screen, like a drop in a pond.",
	},
	{
		value: "shockwave",
		label: "Shockwave",
		subLabel: "One sharp, bright ring races outward and bends the screen as it passes.",
	},
	{
		value: "swirl",
		label: "Swirl",
		subLabel: "The area around your finger twists like water down a drain, then untwists.",
	},
	{
		value: "glitch",
		label: "Glitch",
		subLabel: "Slices of the screen jump sideways and the colours tear apart for half a second.",
	},
	{
		value: "pixel",
		label: "Pixel burst",
		subLabel: "A circle of chunky pixels blooms out from your finger, then sharpens back.",
	},
	{
		value: "ink",
		label: "Ink drop",
		subLabel: "A drop of vivid ink (hot pink, electric blue, violet, green or orange) blooms out from your finger with wobbly edges, rippling the screen, then dissolves.",
	},
	{
		value: "inkmono",
		label: "Ink drop (black & white)",
		subLabel: "The same ink drop in black or white, whichever stands out against what's under your finger.",
	},
	{
		value: "timejump",
		label: "Time jump",
		subLabel: "88 miles an hour: a blue-white flash, electric arcs crackling out from your finger, and the screen sucked in and thrown back out with a pop.",
	},
	{
		value: "lens",
		label: "Lens",
		subLabel:
			"A magnifying glass follows your finger while you hold it. Sends and mentions use Ripple.",
	},
	{
		value: "jelly",
		label: "Jelly",
		subLabel:
			"The screen is jelly: pressing dents it, dragging smears it along, and letting go makes it wobble back. Sends and mentions use Ripple.",
	},
	{
		value: "blackhole",
		label: "Black hole",
		subLabel:
			"Hold to open a black hole that swirls and sucks the screen in, growing the longer you hold. Let go and it all springs back. Sends and mentions use Ripple.",
	},
]

const ALL_PARTICLE_OPTIONS: Option<ParticleStyle>[] = [
	{ value: "none", label: "None", subLabel: "No particles." },
	{ value: "sparks", label: "Sparks", subLabel: "Hot orange sparks shoot out and fall away." },
	{ value: "confetti", label: "Confetti", subLabel: "A pop of colourful paper that tumbles down." },
	{ value: "rainbowbubbles", label: "Rainbow bubbles", subLabel: "Hollow 8-bit rainbow bubbles float up from your tap, wobble gently and fade." },
	{ value: "rainbowpuffs", label: "Rainbow puffs", subLabel: "Nyan Cat's rainbow puffs: pixel stars stream from your tap, drift to the edges and pop into rainbow confetti." },
	{ value: "hearts", label: "Hearts", subLabel: "A handful of hearts float up and fade." },
	{ value: "stars", label: "Stars", subLabel: "Twinkling gold stars burst out and spin." },
	{ value: "firetrails", label: "Fire trails", subLabel: "Two lines of flame burn away from your tap, a tyre-width apart, with a crackle of blue electricity." },
	{ value: "custom", label: "Custom", subLabel: "Your own emoji, server emoji or images." },
]

const ALL_FILTER_OPTIONS: Option<FilterStyle>[] = [
	{ value: "none", label: "None", subLabel: "Discord as it normally looks." },
	{ value: "crt", label: "CRT", subLabel: "Curved glass, scanlines and a soft vignette, like an old monitor." },
	{ value: "nightvision", label: "Night vision", subLabel: "Green phosphor with grain and a round eyepiece." },
	{ value: "vaporwave", label: "Vaporwave", subLabel: "Pink and cyan tones with soft scanlines." },
	{
		value: "vhs",
		label: "VHS",
		subLabel: "Wobbling tape, a rolling tracking band and static. Animated, so it uses more battery.",
	},
	{
		value: "dreamy",
		label: "Dreamy",
		subLabel:
			"Like a daydream: pastel colours and soft clouds drift across the screen, slow whirlpools wander about, bright things glow and little sparkles float up. Animated, so it uses more battery.",
	},
	{
		value: "oldfilm",
		label: "Old film",
		subLabel: "Faded warm tones, grain, flicker, scratches and dust, like an old projector. Animated, so it uses more battery.",
	},
	{
		value: "frost",
		label: "Frosted glass",
		subLabel:
			"The screen frosts over. Wipe it clear with your finger, and it slowly frosts back. Animated, so it uses more battery.",
	},
	{
		value: "rainbowpuffs",
		label: "Rainbow puffs",
		subLabel: "Nyan Cat's rainbow in stepped pixel bands round the edges of the screen, with twinkling stars. Animated, so it uses more battery.",
	},
	{
		value: "flux",
		label: "Flux",
		subLabel: "A cool blue tint and glowing edges. Blue electricity crackles along the edge of the screen, and every few seconds lightning flashes twice, like the clock tower. Animated, so it uses more battery.",
	},
]


export const labelOf = <T>(options: Option<T>[], value: T) =>
	options.find(o => o.value === value)?.label ?? String(value)

export const EFFECT_OPTIONS = ALL_EFFECT_OPTIONS
export const PARTICLE_OPTIONS = ALL_PARTICLE_OPTIONS
export const FILTER_OPTIONS = ALL_FILTER_OPTIONS

/**
 * Power mode's choices: the skin's own effects, then the particles minus None and the heavy
 * Rainbow puffs stream.
 */
export const POWER_PARTICLE_OPTIONS: Option<PowerParticleStyle>[] = [
	{
		value: "skin",
		label: "The skin's own",
		subLabel: "Only the combo skin's effects: coins, flames, petals and so on. Arcade has none, so it throws sparks.",
	},
	...ALL_PARTICLE_OPTIONS.filter(
		(o): o is Option<Exclude<PowerParticleStyle, "skin">> => o.value !== "none" && o.value !== "rainbowpuffs",
	),
]

/** Power mode's combo skins. Each brings its own counter, sounds, rules and high-score finish. */
export const COMBO_SKIN_OPTIONS: Option<ComboSkin>[] = [
	{
		value: "arcade",
		label: "Arcade fighter",
		subLabel: "COMBO ×N, punches and an announcer, and the celebration you pick below.",
	},
	{
		value: "stylerank",
		label: "Style rank",
		subLabel: "A letter rank from D to SSS that climbs the faster you type and drains when you slow down. Keep it up.",
	},
	{
		value: "rhythm",
		label: "Rhythm",
		subLabel: "osu!-style: every key is a hit circle judged 300, 100 or 50 on how steady your rhythm is. Hesitate and it's a miss, which breaks the combo. A record gets a ranking screen.",
	},
	{
		value: "platformer",
		label: "Retro platformer",
		subLabel: "A coin per key, an extra life every 100, and COURSE CLEAR! with fireworks for a record.",
	},
	{
		value: "onfire",
		label: "On fire",
		subLabel: "HEATING UP at 10, ON FIRE at 25: the counter burns and flames fly from the cursor until you stop.",
	},
	{
		value: "shmup",
		label: "Shmup",
		subLabel: "Bullets from the cursor, a score with a chain multiplier, grazes, and a screen-clearing bomb every 50.",
	},
	{
		value: "comic",
		label: "Comic action",
		subLabel: "POW! BAM! ZAP! in comic starbursts, a caption-box counter, and KA-BOOM! for a record.",
	},
	{
		value: "terminal",
		label: "Hacker terminal",
		subLabel: "Green code falls from the cursor, access levels climb every 25, and a record ends in ACCESS GRANTED.",
	},
	{
		value: "cosy",
		label: "Cosy",
		subLabel: "A gentle music box note per key, petals and leaves drifting down, and the odd \"Lovely!\".",
	},
	{
		value: "timecircuits",
		label: "Time circuits",
		subLabel: "Your combo is your speed on a red LED readout, two mph a key. Electricity crackles from the cursor, and at 88 mph there's a boom, a flash and fire trails. A record jumps you through time.",
	},
]

export function capability(native: NativeState | null, kind: "effects" | "filters", id: string): EffectCapability | undefined {
	return (native?.[kind] as Record<string, EffectCapability> | undefined)?.[id]
}

export function availableOptions<T extends string>(options: Option<T>[], native: NativeState | null, kind: "effects" | "filters"): Option<T>[] {
	return options.filter(option => option.value === "none" || capability(native, kind, option.value)?.available === true)
		.map(option => ({ ...option, subLabel: capability(native, kind, option.value)?.description ?? option.subLabel }))
}

export function savedUnavailable(native: NativeState | null, kind: "effects" | "filters", id: string): string | undefined {
	const cap = capability(native, kind, id)
	return cap?.available === false ? `Saved selection is unavailable: ${cap.reason ?? "No renderer in this mode."} It will return when supported.` : undefined
}
