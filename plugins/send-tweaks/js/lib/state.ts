import { DEFAULTS } from '../defaults'
import type { AiHandle, SendTweaksStorage } from '../types'

export const TAG = '[SendTweaks]'

type Storage = RevengeJsonStorageApi<SendTweaksStorage>

let storage: Storage | undefined
let ai: AiHandle | undefined

/** AI Core's handle, or undefined when AI Core is not installed. */
export function getAi(): AiHandle | undefined {
	return ai
}

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

export function setStorage(value: Storage) {
	storage = value
}

/** Sub-pages are plain navigator routes with no plugin `api` prop, so they read through this. */
export function getStorage(): Storage | undefined {
	return storage
}

/** Never reads `cache` without a fallback. */
export function settings(): SendTweaksStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

/**
 * The settings, re-rendering whenever they change -- from this page, the send sheet, or anywhere.
 * Call like a hook.
 *
 * Every page and the sheet read through this one handle, the one `start()` was given. The root page
 * used to read the `api.jsonStorage` Revenge hands a settings component, and a switch flipped in the
 * send sheet did not show there. It also subscribes directly as well as calling `use()`, so a change
 * made elsewhere always redraws the page.
 */
export function useSettings(): SendTweaksStorage {
	const React = revenge.react.React
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	const handle = storage
	const value = handle?.use()
	React.useEffect(() => {
		try {
			return handle?.subscribe?.(() => redraw())
		} catch {
			return undefined
		}
	}, [handle])
	return { ...DEFAULTS, ...(value ?? handle?.cache ?? {}) }
}

export function debug(...args: unknown[]) {
	if (settings().debugLogging) console.log(TAG, ...args)
}
