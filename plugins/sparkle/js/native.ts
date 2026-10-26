import * as native from '@revenge-mod/modules/native'
import { SEASONAL_PETS } from './seasonalPets'
import { BOSS_PETS } from './bossPets'

/** Mirrored from native, which owns the real values (Sparkle needs them before JS has loaded). */
export interface SparkleStorage {
	show: boolean
	/** 0 small, 1 medium, 2 large: the nearest stop to [sizeDp] (native keeps them in step). */
	size: number
	/** How big, in dp: the slider, which snaps to Small, Medium and Large. */
	sizeDp: number
	gravity: boolean
	wander: boolean
	talks: boolean
	/** 0: 1 minute, 1: 3 minutes, 2: 10 minutes, 3: never. */
	sleepAfter: number
	eat: boolean
	shake: boolean
	discord: boolean
	/** In a voice call: 0 normal, 1 sound cooldown, 2 idle only, 3 pet off. */
	voiceMode: number
	voiceCooldown: number
	battery: boolean
	haptics: boolean
	/** Blows bubbles now and then, and when happy. */
	bubbles: boolean
	/** While bubbles are out, a swirling soap-film screen and pops that ripple it (overlay versions below Android 13). */
	bubbleFx: boolean
	/** Sound effects, on the media volume. */
	sounds: boolean
	/** 0..100, on top of the media volume. */
	volume: number
	/** Now and then casts a spell: VFX shows a random filter or effect for a few seconds. */
	magic: boolean
	/** How often magic, treats, the Nyan party and eating happen: 1 Rare, 2 Sometimes, 3 Often, 4 Very often. */
	magicRate: number
	/** How lively it is between touches: 0 Calm, 1 Normal, 2 Lively, 3 Hyper. */
	activity: number
	treatRate: number
	partyRate: number
	eatRate: number
	/** The boss pets: attacks on the screen (on/off, rate), whether the snapshot effects play, the horse's visits and the ride's length. */
	attacks: boolean
	attackRate: number
	attackFx: boolean
	companion: boolean
	companionRate: number
	rideMinutes: number
	/**
	 * What spells may show. JS-only (native never sees it; it goes to VFX with each spell).
	 * "block": everything except [spellList], so things VFX adds later are in. "allow": only [spellList].
	 */
	spellMode: "block" | "allow"
	/** VFX spell ids (`filter:crt`, `effect:ripple`, `particles:hearts`, `message:slam`). */
	spellList: string[]
	/** Message reactions (lib/moods.ts), JS-only like the spell list. Ids of reactions switched off. */
	moodsOff: string[]
	/** Keywords the user added, by reaction id. */
	moodAdded: Record<string, string[]>
	/** Built-in keywords the user removed, by reaction id. */
	moodRemoved: Record<string, string[]>
	/** Reactions also play their own full-screen effect (native ScreenFx.kt). */
	moodEffects: boolean
	/** Reaction ids whose full-screen effect is off. */
	moodFxOff: string[]
	/** Stays quiet while the phone is on silent or vibrate. */
	quietOnSilent: boolean
	/** 0: always on screen. 1: only while the keyboard is up. */
	showWhen: number
	/** Now and then a treat drops in; tap it to feed it. */
	treats: boolean
	/** What it calls itself. */
	name: string
	/** Which pet: 0 unicorn, 1 Nyan Cat, 2–13 cats/dogs, 14 Gary, 15–18 seasonal. */
	look: number
	/** Picker-only preference; hiding a pack does not dismiss the active pet. */
	hiddenPacks: string[]
	/** Nyan Cat only: now and then a Nyan party (big cat, space, the song). */
	nyanParty: boolean
	/** Cats and dogs: 0 no outline, 1 automatic (contrasts with the theme), 2 light, 3 dark. */
	outline: number
	/** Opt-in reputation: how it treats your buttons follows how you treat it (see Pet.kt, reputation). */
	grudges: boolean
}

export interface NativeState extends SparkleStorage {
	pets: number
	eaten: number
	treatsEaten: number
	/** Happiness, 0..100. */
	love: number
	/** Reputation, -100..100: how it feels about you. Only moves while [grudges] is on. */
	rep?: number
	state: string
}

export const DEFAULTS: SparkleStorage = {
	show: true,
	size: 1,
	sizeDp: 64,
	gravity: false,
	wander: true,
	talks: true,
	sleepAfter: 1,
	eat: true,
	shake: true,
	discord: true,
	voiceMode: 0,
	voiceCooldown: 30,
	battery: true,
	haptics: true,
	bubbles: true,
	bubbleFx: true,
	sounds: true,
	volume: 70,
	magic: false,
	magicRate: 2,
	activity: 1,
	treatRate: 2,
	partyRate: 2,
	eatRate: 2,
	attacks: true,
	attackRate: 2,
	attackFx: true,
	companion: true,
	companionRate: 2,
	rideMinutes: 5,
	spellMode: "block",
	spellList: [],
	moodsOff: [],
	moodAdded: {},
	moodRemoved: {},
	moodEffects: false,
	moodFxOff: [],
	quietOnSilent: true,
	showWhen: 0,
	treats: true,
	name: "Sparkle",
	look: 0,
	hiddenPacks: [],
	nyanParty: false,
	outline: 1,
	grudges: false,
}

/** The size slider: its range and the stops it snaps to (native's SIZE_DP). */
export const SIZE = { min: 40, max: 110, snap: 3 } as const
export const SIZE_STOPS = [
	{ label: "Small", dp: 52 },
	{ label: "Medium", dp: 64 },
	{ label: "Large", dp: 80 },
] as const

/** "Medium", or "Between Medium and Large" off the stops. */
export function sizeLabel(dp: number): string {
	const stop = SIZE_STOPS.find(s => s.dp === dp)
	if (stop) return stop.label
	if (dp < SIZE_STOPS[0].dp) return "Smaller than Small"
	if (dp > SIZE_STOPS[SIZE_STOPS.length - 1].dp) return "Bigger than Large"
	const above = SIZE_STOPS.findIndex(s => s.dp > dp)
	return `Between ${SIZE_STOPS[above - 1].label} and ${SIZE_STOPS[above].label}`
}

/** Every pet, by id (native's Looks: 0 unicorn, 1 Nyan Cat, 2-7 cats, 8-13 dogs, 14 Gary, 15-18 seasonal). */
export const LOOKS = [
	{ id: 0, label: "Unicorn", kind: "unicorn", defaultName: "Sparkle", bubbles: "bubbles", leaves: "flies off on its rainbow" },
	{ id: 1, label: "Nyan Cat", kind: "nyan", defaultName: "Nyan", bubbles: "rainbow puffs", leaves: "zooms off on its rainbow" },
	{ id: 14, label: "Gary the Snail", kind: "gary", defaultName: "Gary", bubbles: "bubbles", leaves: "tucks into his shell and heads off" },
	...SEASONAL_PETS,
	...BOSS_PETS,
	// The first free seasonal pets, in with the holiday packs (the "Original seasonal" group is gone).
	// Turkey (id 16) is hidden; native still has it. index.ts moves anyone who picked it to the unicorn.
	// { id: 16, label: "Turkey", kind: "seasonal", pack: "thanksgiving", defaultName: "Gobbles", bubbles: "bubbles", leaves: "waddles off" },
	{ id: 17, label: "Snowman", kind: "seasonal", pack: "christmas", defaultName: "Frosty", bubbles: "bubbles", leaves: "melts away" },
	{ id: 18, label: "Dragon", kind: "seasonal", pack: "classic", defaultName: "Ember", bubbles: "bubbles", leaves: "flies off" },
	{ id: 2, label: "Ginger cat", kind: "cat", defaultName: "Ginger", bubbles: "bubbles", leaves: "trots off" },
	{ id: 3, label: "Black cat", kind: "cat", defaultName: "Shadow", bubbles: "bubbles", leaves: "trots off" },
	{ id: 4, label: "Siamese cat", kind: "cat", defaultName: "Miso", bubbles: "bubbles", leaves: "trots off" },
	{ id: 5, label: "Sphynx cat", kind: "cat", defaultName: "Noodle", bubbles: "bubbles", leaves: "trots off" },
	{ id: 6, label: "Ragdoll cat", kind: "cat", defaultName: "Cloud", bubbles: "bubbles", leaves: "trots off" },
	{ id: 7, label: "Grey tabby", kind: "cat", defaultName: "Tiger", bubbles: "bubbles", leaves: "trots off" },
	{ id: 8, label: "Golden Retriever", kind: "dog", defaultName: "Sunny", bubbles: "bubbles", leaves: "runs off" },
	{ id: 9, label: "Akita", kind: "dog", defaultName: "Kiko", bubbles: "bubbles", leaves: "runs off" },
	{ id: 10, label: "Great Dane", kind: "dog", defaultName: "Duke", bubbles: "bubbles", leaves: "runs off" },
	{ id: 11, label: "Schnauzer", kind: "dog", defaultName: "Pepper", bubbles: "bubbles", leaves: "runs off" },
	{ id: 12, label: "Saint Bernard", kind: "dog", defaultName: "Bernie", bubbles: "bubbles", leaves: "runs off" },
	{ id: 13, label: "Siberian Husky", kind: "dog", defaultName: "Blizzard", bubbles: "bubbles", leaves: "runs off" },
] as const

export function lookOf(id: number) {
	return LOOKS.find(l => l.id === id) ?? LOOKS[0]
}

const METHOD = "bleelblep.sparkle"

/** Same bridge call as VFX and Focus Bubble. */
export function callNative(name: string, args: any[] = []): Promise<any> {
	return (native as any).callNativeMethod(`${METHOD}.${name}`, args)
}
