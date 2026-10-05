import { DEFAULTS, normalize, type Settings } from './model'

let storage: RevengeJsonStorageApi<Settings> | undefined
let generation = 0
let queue: Promise<unknown> = Promise.resolve()
const listeners = new Set<() => void>()
export const native = (method: string, args: unknown[] = []): Promise<any> =>
	(revenge.modules.native as any).callNativeMethod(`bleelblep.scenes.${method}`, args)
export function settings(): Settings { return normalize(storage?.cache ?? DEFAULTS) }
export function useSettings(): Settings {
	const React = revenge.react.React
	const [, redraw] = React.useState(0)
	React.useEffect(() => {
		const notify = () => redraw((n: number) => n + 1)
		listeners.add(notify)
		return () => { listeners.delete(notify) }
	}, [])
	return settings()
}
export function update(patch: Partial<Settings>): Promise<any> {
	const handle = storage, token = generation
	const work = async () => {
		if (!handle) throw new Error('Enable the Scenes plugin first.')
		if (!handle.loaded) await handle.get()
		if (token !== generation) throw new Error('Scenes was stopped.')
		await handle.set(normalize({ ...settings(), ...patch }), true)
		if (token !== generation) return
		return native('configure', [settings()])
	}
	const result = queue.then(work)
	queue = result.catch(() => {})
	return result
}
export function start(handle: RevengeJsonStorageApi<Settings>) {
	storage = handle
	const token = ++generation
	const notify = () => { if (token === generation) for (const listener of listeners) listener() }
	const unsubscribe = handle.subscribe(notify)
	// Await the disk read rather than treating its Promise as a settings object.
	queue = Promise.resolve(handle.loaded ? handle.cache : handle.get()).then(() => {
		if (token !== generation) return
		notify()
		return native('configure', [settings()])
	}).catch(error => console.error('[Scenes] startup:', error))
	return () => {
		generation++; storage = undefined; unsubscribe()
		void native('disable').catch(() => {})
	}
}
