import { DEFAULTS, normalize, parseScene, PRESETS, type Scene, type Settings } from './scenes'

let storage: RevengeJsonStorageApi<Settings> | undefined
let ai: any
let live = false
let generation = 0
let lastSync = ''
const listeners = new Set<() => void>()
export const native = (name: string, args: unknown[] = []): Promise<any> =>
	(revenge.modules.native as any).callNativeMethod(`bleelblep.dreamscape.${name}`, args)
export function settings(): Settings { return normalize(storage?.cache ?? DEFAULTS) }
export function scenes(): Scene[] { return [...PRESETS, ...settings().scenes] }
export function channel(): string | undefined {
	try { return (revenge.discord.flux.Stores as any).SelectedChannelStore?.getChannelId?.() } catch { return undefined }
}
export function selected(): Scene { return scenes().find(s => s.id === settings().sceneId) ?? PRESETS[0] }
export async function previewScene(scene: Scene = selected()) {
	await update({ enabled: true, dreams: true, sceneId: scene.id })
	await sync(true)
	return native('preview', [scene])
}
export async function sync(force = false) {
	if (!live) return
	const s = settings(), current = channel()
	const scene = current ? scenes().find(v => v.id === s.channels[current]) : undefined
	const payload = { ...s, scenes: undefined, channels: undefined, scene: scene ?? selected(), channelScene: !!scene }
	const key = JSON.stringify(payload)
	if (!force && lastSync === key) return
	lastSync = key
	try { await native('configure', [payload]) } catch (e) { lastSync = ''; console.error('[Dreamscape] sync:', e) }
}
export async function update(patch: Partial<Settings>) {
	const handle = storage, token = generation
	if (!handle) return
	try {
		if (!handle.loaded) await handle.get()
		if (!live || token !== generation) return
		// Replace the complete snapshot so removed channel assignments stay removed.
		await handle.set(normalize({ ...settings(), ...patch }), true)
	} catch (e) { console.error('[Dreamscape] save:', e) }
}
export function useSettings(): Settings {
	const React = revenge.react.React
	const [, set] = React.useState(0)
	React.useEffect(() => { const f = () => set((n: number) => n + 1); listeners.add(f); return () => { listeners.delete(f) } }, [])
	return settings()
}
export function start(api: any) {
	storage = api.jsonStorage; ai = api.ai; live = true; generation++
	const handle = storage!, token = generation
	const changed = () => {
		if (!live || token !== generation) return
		for (const notify of listeners) notify()
		void sync(true)
	}
	const unsubscribe = handle.subscribe(changed)
	// Loading is asynchronous. Never overwrite saved preferences with defaults at startup.
	if (handle.loaded) changed()
	else void handle.get().then(changed).catch(e => console.error('[Dreamscape] load:', e))
	const timer = setInterval(() => void sync(), 750)
	ai?.setSettingsRoute?.('bleelblep.dreamscape')
	return () => { live = false; generation++; unsubscribe(); clearInterval(timer); lastSync = ''; ai = undefined; storage = undefined; void native('disable').catch(() => {}) }
}
export async function generate(prompt: string): Promise<Scene> {
	if (!prompt.trim()) throw new Error('Describe a scene first.')
	if (!ai?.isAvailable?.()) throw new Error('Configure AI Core and check its remaining budget first.')
	const token = generation
	const answer = await ai.json({ temperature: 0.6, maxTokens: 240, messages: [
		{ role: 'system', content: 'Return one JSON scene recipe only: {"version":1,"name":"short name","world":"space|ocean|storm|library","color":"#RRGGBB","intensity":0.1..0.7,"speed":0.1..1,"particles":0..48}. Pick exactly one world enum. No code or URLs. Reflect the description using these supported visual controls.' },
		{ role: 'user', content: prompt.slice(0, 1200) },
	] })
	if (!live || token !== generation) throw new Error('Dreamscape was stopped; the result was discarded.')
	const scene = parseScene(answer, `dream_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
	if (!scene) throw new Error('AI returned an unsupported scene. Try a simpler description.')
	if (settings().scenes.length >= 40) throw new Error('The library is full. Delete a scene first.')
	update({ scenes: [...settings().scenes, scene], sceneId: scene.id })
	return scene
}
