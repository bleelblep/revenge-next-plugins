import { DEFAULTS, type NativeState, type ScreenEffectsStorage, callNative } from "../native"
import * as React from "react"
import { reportError } from "../../../../shared/report"

/**
 * Shared by every settings page. Sub-pages are separate routes and get no `api` prop, so the
 * storage handle is set once in `start()` and read from here.
 */
const JS_ONLY = new Set(["customInput", "powerCustomInput"])

let storage: RevengeJsonStorageApi<ScreenEffectsStorage> | undefined

export function setStorage(handle: RevengeJsonStorageApi<ScreenEffectsStorage>) {
	storage = handle
}

/**
 * Brings the storage mirror in line with native, which owns the values. Quick Toggles flips
 * settings through native `setSettings`, which never reaches this storage, so pages showed the old
 * values until a restart. Run when a page opens, and by Quick Toggles through the global hook below
 * right after it changes something. Only keys the storage has are copied.
 */
export function syncFromNative(): Promise<void> {
	return callNative("getSettings")
		.then((state: NativeState) => {
			if (!state || typeof state.intensity !== "number" || !storage) return
			const stored: Record<string, unknown> = {}
			// The custom inputs are JS-only, so they are never copied from native.
			for (const key of Object.keys(DEFAULTS)) if (!JS_ONLY.has(key) && key in state) stored[key] = (state as any)[key]
			storage.set(stored as Partial<ScreenEffectsStorage>)
			publish(state)
		})
		.catch(error => reportError("[ScreenEffects] getSettings failed:", error))
}

/** `globalThis.__bleelblepSettingsSync[pluginId]`: how Quick Toggles asks a plugin to re-read native. */
export function registerSync(id: string, sync: () => unknown): () => void {
	const g = globalThis as any
	g.__bleelblepSettingsSync ??= {}
	g.__bleelblepSettingsSync[id] = sync
	return () => {
		if (g.__bleelblepSettingsSync?.[id] === sync) delete g.__bleelblepSettingsSync[id]
	}
}

/** The saved settings, re-rendering on change, re-read from native when the page opens. Call like a hook. */
export function useSettings(): ScreenEffectsStorage {
	React.useEffect(() => {
		syncFromNative()
	}, [])
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

let nativeState: NativeState | null = null
const listeners = new Set<(state: NativeState) => void>()

export function watchNative(listener: (state: NativeState) => void): () => void {
	listeners.add(listener)
	if (nativeState) listener(nativeState)
	return () => { listeners.delete(listener) }
}

function publish(state: NativeState) {
	if (!state) return
	nativeState = state
	for (const listener of listeners) listener(state)
}

export function refreshNative(): Promise<void> {
	return callNative("getSettings")
		.then(publish)
		.catch(error => reportError("[ScreenEffects] getSettings failed:", error))
}

/** What native reports: support, broken effects, loaded custom sprites. Call like a hook. */
export function useNative(): NativeState | null {
	const [state, setState] = React.useState<NativeState | null>(nativeState)
	React.useEffect(() => {
		listeners.add(setState)
		refreshNative()
		// Renderer initialization/draw failures can arrive after setSettings resolves.
		const poll = setInterval(refreshNative, 1500)
		return () => {
			clearInterval(poll)
			listeners.delete(setState)
		}
	}, [])
	return state
}

/** Saves a change and hands it to native, which applies it on the next touch. */
export function update(patch: Partial<ScreenEffectsStorage>, nativePatch: Record<string, unknown> = patch) {
	storage?.set(patch)
	callNative("setSettings", [nativePatch])
		.then(publish)
		.catch(error => reportError("[ScreenEffects] setSettings failed:", error))
}

let testPads = 0

/**
 * Taps on a page with the test pad play the chosen effects even with taps or a master switch off.
 * Counted, so two mounted pads (a quick back-and-forward) can't switch it off early. Call like a hook.
 */
export function useTestPad() {
	React.useEffect(() => {
		if (testPads++ === 0) callNative("setTestPad", [true]).catch(() => {})
		return () => {
			if (--testPads === 0) callNative("setTestPad", [false]).catch(() => {})
		}
	}, [])
}
