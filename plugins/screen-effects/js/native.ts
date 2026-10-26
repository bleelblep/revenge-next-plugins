import * as native from '@revenge-mod/modules/native'

export type EffectStyle =
	| "none"
	| "ripple"
	| "shockwave"
	| "swirl"
	| "glitch"
	| "pixel"
	| "ink"
	| "inkmono"
	| "timejump"
	| "lens"
	| "jelly"
	| "blackhole"

export type FilterStyle =
	| "none"
	| "crt"
	| "nightvision"
	| "vaporwave"
	| "vhs"
	| "dreamy"
	| "frost"
	| "oldfilm"
	| "rainbowpuffs"
	| "flux"

export type ParticleStyle =
	| "none"
	| "sparks"
	| "confetti"
	| "rainbowbubbles"
	| "rainbowpuffs"
	| "hearts"
	| "stars"
	| "firetrails"
	| "custom"

/** Power mode throws a few per key, so the heavy Rainbow puffs stream isn't offered. */
/** "skin": only the combo skin's own effects (Arcade has none, so it throws sparks). */
export type PowerParticleStyle = Exclude<ParticleStyle, "none" | "rainbowpuffs"> | "skin"

/** Power mode's combo skin: look, sounds, rules and high-score finish (ComboSkins.kt). */
export type ComboSkin = "arcade" | "stylerank" | "rhythm" | "platformer" | "onfire" | "shmup" | "comic" | "terminal" | "cosy" | "timecircuits"

/** One thing the Custom particles can throw: text (split into single emoji natively) or an image. */
export type CustomItem = { type: "text"; value: string } | { type: "image"; url: string }

/** Mirrored from native, which owns the real values (it needs them before JS has loaded). */
export interface ScreenEffectsStorage {
	style: EffectStyle
	particles: ParticleStyle
	intensity: number
	dose: number
	allWindows: boolean
	/** Force the Android 12-and-earlier renderer on newer devices for compatibility testing. */
	forceLegacy: boolean
	/** Live-capture distortions on the legacy tier. On by default; a Debug switch. */
	legacyRipple: boolean
	/** Taps play: false is the tap slider's Off stop. */
	onTap: boolean
	charge: boolean
	onSend: boolean
	onReceive: boolean
	/** What the user typed for Custom particles; resolved into [CustomItem]s before going native. */
	customInput: string
	filter: FilterStyle
	powerMode: boolean
	powerShake: boolean
	powerCombo: boolean
	/** What flies as you type. */
	powerParticles: PowerParticleStyle
	/** What the user typed for power mode's Custom particles; JS-only, like `customInput`. */
	powerCustomInput: string
	/** Play effects hidden in messages others send with /fx. */
	messageEffects: boolean
	/** Keep and show the best power mode combo. */
	trackHighScore: boolean
	/** Punches and an announcer while typing in power mode. */
	comboSounds: boolean
	/** No combo sounds while the phone is on silent or vibrate. */
	quietOnSilent: boolean
	/** How a new high score is celebrated. */
	celebration: "arcade" | "banner" | "levelup"
	comboSkin: ComboSkin
}

export interface EffectCapability {
	available: boolean
	renderer: "none" | "agsl" | "canvas" | "opengl"
	quality: "full" | "approximate"
	description?: string
	reason?: string
}

export interface NativeState extends Omit<ScreenEffectsStorage, "customInput" | "powerCustomInput"> {
	/** Effective shader support: Android 13+ with forceLegacy off. Particles work regardless. */
	supported: boolean
	/** Real device API level; the compatibility override never changes it. */
	apiLevel: number
	rendererTier: "modern" | "legacy"
	hardwareAccelerated: boolean | null
	effects: Record<EffectStyle, EffectCapability>
	filters: Record<FilterStyle, EffectCapability>
	messageCapabilities: Record<string, boolean>
	rippleDiagnostics: { status: string; frames: number; captureMs: number; renderMs: number; totalMs: number; imageSize: string; captures: number; averageCaptureMs: number; peakCaptureMs: number; captureIntervalMs: number }
	/** The touch hooks are installed. */
	hooked: boolean
	/** Effects whose shader would not compile on this phone; native falls back to ripple.
	 * Filters show up as `filter:<id>`. */
	brokenStyles: string[]
	custom: CustomItem[]
	/** How many custom sprites are ready. Images download in the background, so this lags. */
	customLoaded: number
	powerCustom: CustomItem[]
	powerCustomLoaded: number
	/** The typing hook for power mode is installed. */
	textHooked: boolean
	/** The best combo so far. Native-owned and always read live, never mirrored. */
	highScore: number
}

export const DEFAULTS: ScreenEffectsStorage = {
	style: "ripple",
	particles: "none",
	intensity: 0.6,
	dose: 0,
	allWindows: true,
	forceLegacy: false,
	legacyRipple: true,
	onTap: true,
	charge: false,
	onSend: false,
	onReceive: false,
	customInput: "",
	filter: "none",
	powerMode: false,
	powerShake: true,
	powerCombo: true,
	powerParticles: "sparks",
	powerCustomInput: "",
	messageEffects: true,
	trackHighScore: true,
	comboSounds: false,
	quietOnSilent: true,
	celebration: "arcade",
	comboSkin: "arcade",
}

const METHOD = "bleelblep.screen-effects"

/** Same bridge call as text-brightness and ghost-log-native-beta. */
export function callNative(name: string, args: any[] = []): Promise<any> {
	return (native as any).callNativeMethod(`${METHOD}.${name}`, args)
}
