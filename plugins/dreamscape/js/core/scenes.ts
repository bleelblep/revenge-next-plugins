export const WORLDS = ['space', 'ocean', 'storm', 'library'] as const
export type World = (typeof WORLDS)[number]
export interface Scene {
	version: 1
	id: string
	name: string
	world: World
	color: string
	intensity: number
	speed: number
	particles: number
}
export const PRESETS: Scene[] = [
	{ version: 1, id: 'space', name: 'Moonlit orbit', world: 'space', color: '#A78BFA', intensity: 0.35, speed: 0.4, particles: 24 },
	{ version: 1, id: 'ocean', name: 'Midnight aquarium', world: 'ocean', color: '#45D6C8', intensity: 0.3, speed: 0.35, particles: 18 },
	{ version: 1, id: 'storm', name: 'Neon rain', world: 'storm', color: '#E18BD9', intensity: 0.4, speed: 0.7, particles: 32 },
	{ version: 1, id: 'library', name: 'Enchanted library', world: 'library', color: '#E6BA78', intensity: 0.25, speed: 0.2, particles: 16 },
]
const finite = (v: unknown, lo: number, hi: number) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi
/** Validate AI output and persisted scenes with the same strict contract. */
export function parseScene(value: unknown, id?: string): Scene | undefined {
	if (!value || typeof value !== 'object') return
	const v = value as Record<string, unknown>
	if (v.version !== 1 || typeof v.name !== 'string' || !v.name.trim() || v.name.length > 60) return
	if (!WORLDS.includes(v.world as World) || typeof v.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(v.color)) return
	if (!finite(v.intensity, 0.1, 0.7) || !finite(v.speed, 0.1, 1) || !finite(v.particles, 0, 48)) return
	const key = id ?? v.id
	if (typeof key !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(key)) return
	return { version: 1, id: key, name: v.name.trim(), world: v.world as World, color: v.color,
		intensity: v.intensity as number, speed: v.speed as number, particles: Math.round(v.particles as number) }
}

export interface Settings {
	bindings: Record<'circle' | 'zigzag' | 'v', string>
	enabled: boolean
	glass: boolean
	hologram: boolean
	tear: boolean
	spellbook: boolean
	dreams: boolean
	playEverywhere: boolean
	demo: boolean
	tilt: boolean
	reducedMotion: boolean
	fps: number
	glassStyle: 'clear' | 'frosted' | 'smoked'
	holoStyle: 'foil' | 'prismatic' | 'ghost'
	strength: number
	sceneId: string
	scenes: Scene[]
	channels: Record<string, string>
}
export const DEFAULTS: Settings = {
	bindings: { circle: 'portal', zigzag: 'meteor', v: 'prism' },
	enabled: false, glass: true, hologram: false, tear: true, spellbook: true,
	dreams: true, playEverywhere: false, demo: false, tilt: true, reducedMotion: false, fps: 60,
	glassStyle: 'clear', holoStyle: 'foil', strength: 0.5, sceneId: 'space', scenes: [], channels: {},
}
export function normalize(raw: Partial<Settings> = {}): Settings {
	const s = { ...DEFAULTS, bindings: { ...DEFAULTS.bindings }, channels: {} as Record<string, string> }
	for (const key of ['circle', 'zigzag', 'v'] as const) {
		const value = raw.bindings?.[key]
		if (value && ['portal', 'frost', 'prism', 'meteor'].includes(value)) s.bindings[key] = value
	}
	for (const k of ['enabled', 'glass', 'hologram', 'tear', 'spellbook', 'dreams', 'playEverywhere', 'demo', 'tilt', 'reducedMotion'] as const)
		if (typeof raw[k] === 'boolean') s[k] = raw[k]!
	s.fps = [15, 30, 60, 90].includes(raw.fps!) ? raw.fps! : 60
	if (['clear', 'frosted', 'smoked'].includes(raw.glassStyle!)) s.glassStyle = raw.glassStyle!
	if (['foil', 'prismatic', 'ghost'].includes(raw.holoStyle!)) s.holoStyle = raw.holoStyle!
	if (finite(raw.strength, 0.1, 1)) s.strength = raw.strength!
	s.scenes = Array.isArray(raw.scenes) ? raw.scenes.map(v => parseScene(v)).filter((v): v is Scene => !!v).slice(0, 40) : []
	const ids = new Set([...PRESETS, ...s.scenes].map(v => v.id))
	if (ids.has(raw.sceneId!)) s.sceneId = raw.sceneId!
	if (raw.channels && typeof raw.channels === 'object') for (const [channel, scene] of Object.entries(raw.channels).slice(0, 200))
		if (/^\d{5,25}$/.test(channel) && ids.has(scene)) s.channels[channel] = scene
	return s
}
