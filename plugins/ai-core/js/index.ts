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
 * ## What it deliberately does not do
 *
 * No prompts live here. No plugin-specific context building, no caching of anyone's messages,
 * no retry policy beyond the timeout. Those belong to the plugin that knows what it is asking.
 */

import { DEFAULTS } from './defaults'
import { abortAll, requestJson, requestText } from './lib/client'
import { rememberDependent, setDependentRoute } from './lib/dependents'
import { remainingFor, setStorage, settings, today } from './lib/state'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { AiApi, AiBudget, AiCoreStorage, AiRequest } from './types'

export { DEFAULTS }
export type { AiApi, AiBudget, AiCoreStorage, AiRequest }

function budget(pluginId: string): AiBudget {
	const s = settings()
	const fresh = s.usageDay !== today()
	return {
		configured: !!s.apiKey,
		used: fresh ? 0 : s.usageCalls,
		cap: s.dailyCallCap,
		remaining: remainingFor(pluginId),
		promptTokens: fresh ? 0 : s.usagePromptTokens,
		completionTokens: fresh ? 0 : s.usageCompletionTokens,
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
					const s = settings()
					return !!s.apiKey && s.dailyCallCap > 0 && remainingFor(pluginId) > 0
				},
				text: (request: AiRequest) => requestText(pluginId, request),
				json: <T>(request: AiRequest) => requestJson<T>(pluginId, request),
				budget: () => budget(pluginId),
				setSettingsRoute: (route: string) => setDependentRoute(pluginId, route),
			}
			;(plugin.api as any).ai = api
		})
	},

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error('[AiCore] failed to register settings pages:', error)
		}

		// Synchronous, because teardown is given five seconds before the plugin is flagged.
		cleanup(() => abortAll())
	},

	SettingsComponent: Settings,
})
