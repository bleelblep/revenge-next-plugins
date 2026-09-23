/**
 * AI Core — one key, one budget, one queue.
 *
 * This plugin has no behaviour of its own. It exists so that the plugins in this repository that
 * want a model behind them do not each ship their own client, ask for their own copy of the same
 * API key, and count their own private daily limit that means nothing to the user.
 *
 * ## How a dependent reaches it
 *
 * `decorate()` hangs an `ai` object on the scoped api of every plugin that declares a dependency
 * on `bleelblep.ai-core`. Revenge runs a dependency's lifecycle stages before its dependents', so
 * by the time a dependent's `start` runs the key is loaded and the queue is up.
 *
 * Dependents should declare the dependency as `optional` unless a model is genuinely required to
 * function. `api.ai` is then simply `undefined` when this plugin is not installed, and the
 * dependent is expected to carry on without it. Second Thoughts is the reference for that shape:
 * its pattern checks are the product, and the model only adds judgement calls on top.
 *
 * ## Where the key lives
 *
 * Not here. Since 2.0 the key is typed into a native dialog, kept encrypted by the Android
 * Keystore, and the request is made natively -- see `src/main/kotlin/.../AiCore.kt` for why and
 * for what that does and does not protect against. This side never holds it.
 *
 * ## What it deliberately does not do
 *
 * No prompts live here. No plugin-specific context building, no caching of anyone's messages,
 * no retry policy beyond the timeout. Those belong to the plugin that knows what it is asking.
 */

import { DEFAULTS } from './defaults'
import { abortAll, requestJson, requestText } from './lib/client'
import { rememberDependent, setDependentRoute } from './lib/dependents'
import { debug, remainingFor, setStorage, TAG } from './lib/state'
import { importLegacy, refreshStatus, vaultStatus } from './lib/vault'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { AiApi, AiBudget, AiCoreStorage, AiRequest } from './types'

export { DEFAULTS }
export type { AiApi, AiBudget, AiCoreStorage, AiRequest }

function budget(pluginId: string): AiBudget {
	const v = vaultStatus()
	return {
		configured: v.configured,
		used: v.calls,
		cap: v.cap,
		remaining: remainingFor(pluginId),
		promptTokens: v.promptTokens,
		completionTokens: v.completionTokens,
	}
}

/**
 * Moves a key saved by AI Core 1.x (plain text in `storage.json`) into the native vault, then
 * blanks it. Runs once: the native side refuses the import after its vault has ever been written.
 * If the native half is not running the old key is left alone, so a later start can still move
 * it -- wiping it then would just lose it.
 */
async function migrateLegacyKey(jsonStorage: RevengeJsonStorageApi<AiCoreStorage>) {
	const stored = { ...DEFAULTS, ...((await jsonStorage.get()) ?? {}) }
	const status = await refreshStatus()
	if (!status.native) {
		console.error(`${TAG} native half not running; AI Core cannot call out`)
		return
	}
	if (!status.migrated) {
		const moved = await importLegacy(stored.apiKey, stored.baseUrl, stored.dailyCallCap)
		debug(`legacy import ${moved ? 'done' : 'refused'}`)
	}
	if (stored.apiKey) {
		await jsonStorage.set({ apiKey: '' })
		console.log(`${TAG} old plain-text key removed from storage`)
	}
}

export default plugin<{ jsonStorage: AiCoreStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	init({ decorate }) {
		decorate(plugin => {
			const pluginId = plugin.manifest.id
			// Free of charge: decorate hands us the dependent's whole manifest, so the settings
			// screen can list every plugin using this one without any cooperation from them.
			rememberDependent(
				pluginId,
				plugin.manifest.name ?? pluginId,
				plugin.manifest.icon,
			)
			const api: AiApi = {
				isAvailable: () => {
					const v = vaultStatus()
					return v.configured && remainingFor(pluginId) > 0
				},
				text: (request: AiRequest) => requestText(pluginId, request),
				json: <T>(request: AiRequest) => requestJson<T>(pluginId, request),
				budget: () => budget(pluginId),
				setSettingsRoute: (route: string) => setDependentRoute(pluginId, route),
			}
			;(plugin.api as any).ai = api
		})
	},

	start({ cleanup, jsonStorage, plugin }) {
		// Enabling a plugin mid-session leaves its hooks half-applied -- Discord modules it patches
		// may already be initialized and its settings routes are registered too late for the
		// settings screen. Ask for a reload instead of running in a state we cannot verify.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		setStorage(jsonStorage)

		migrateLegacyKey(jsonStorage).catch(error => {
			console.error(`${TAG} key migration failed:`, error)
		})

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error('[AiCore] failed to register settings pages:', error)
		}

		// Presence marker for plugins that only need to know AI Core is running, not use it --
		// Plugin Hub shows its AI Hub row on this. Declaring a dependency instead would run them
		// through `decorate` and list them here as AI plugins, which they are not.
		;(globalThis as any).__bleelblepAiCore = true
		cleanup(() => {
			delete (globalThis as any).__bleelblepAiCore
		})

		// Synchronous, because teardown is given five seconds before the plugin is flagged.
		cleanup(() => abortAll())
	},

	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
