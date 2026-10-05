export const ATMOSPHERES = [
	{ id: 'aurora', name: 'Northern lights', description: 'Slow emerald and violet curtains with distant stars.' },
	{ id: 'nebula', name: 'Deep space', description: 'Drifting violet clouds, blue nebulae and softly twinkling stars.' },
	{ id: 'ocean', name: 'Underwater', description: 'Teal depth, moving caustic light and rising bubbles.' },
	{ id: 'rain', name: 'Midnight rain', description: 'Blue-grey mist and luminous rain streaks.' },
	{ id: 'embers', name: 'Ember glow', description: 'Warm amber haze and embers floating upward.' },
	{ id: 'forest', name: 'Enchanted light', description: 'Golden shafts of light, moss-green haze and fireflies.' },
	{ id: 'halloween', name: 'Halloween', description: "A harvest moon with bats flapping past, eerie fog and a jack-o'-lantern glow." },
	{ id: 'thanksgiving', name: 'Thanksgiving', description: 'Autumn leaves tumbling down in a warm golden-hour light.' },
	{ id: 'christmas', name: 'Christmas', description: 'Falling snow, a drift along the bottom and twinkling string lights.' },
] as const
export type AtmosphereId = (typeof ATMOSPHERES)[number]['id']
export interface Settings {
	enabled: boolean
	scene: AtmosphereId
	intensity: number
	speed: number
	fps: number
	reducedMotion: boolean
}
export const DEFAULTS: Settings = { enabled: false, scene: 'aurora', intensity: .65, speed: .6, fps: 60, reducedMotion: false }
export function normalize(raw: Partial<Settings> = {}): Settings {
	const number = (v: unknown, fallback: number, min: number, max: number) =>
		typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback
	return {
		enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULTS.enabled,
		scene: ATMOSPHERES.some(s => s.id === raw.scene) ? raw.scene! : DEFAULTS.scene,
		intensity: number(raw.intensity, DEFAULTS.intensity, .1, 1),
		speed: number(raw.speed, DEFAULTS.speed, .1, 1.5),
		fps: [30, 60, 90].includes(raw.fps!) ? raw.fps! : DEFAULTS.fps,
		reducedMotion: typeof raw.reducedMotion === 'boolean' ? raw.reducedMotion : false,
	}
}
