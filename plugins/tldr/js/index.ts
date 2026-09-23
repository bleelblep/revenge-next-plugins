/**
 * TL;DR -- the gist of one long message, for your eyes only.
 *
 * Long-press a message that is at least `minLength` characters (link previews included) and a
 * "TL;DR" row appears. Tapping it sends that one message to AI Core and shows the answer in an
 * alert. Nothing is posted and nothing is kept past the session.
 *
 * AI Core is **required**, like Catch Up: there is no useful local version of "summarise this".
 */

import { DEFAULTS } from './defaults'
import { releaseMemory } from './lib/summarise'
import { setAi, setStorage, TAG } from './lib/state'
import patchMessageSheet from './patches/messageSheet'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { AiHandle, TldrStorage } from './types'

export { DEFAULTS }
export type { TldrStorage }

export default plugin<{ jsonStorage: TldrStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Enabling a plugin mid-session leaves its hooks half-applied -- Discord modules it patches
		// may already be initialized and its settings routes are registered too late for the
		// settings screen. Ask for a reload instead of running in a state we cannot verify.
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)

		const ai = (api as any).ai as AiHandle | undefined
		setAi(ai)
		cleanup(() => {
			setAi(undefined)
			// Only the in-memory mirror: the saved summaries are meant to outlive a restart.
			releaseMemory()
		})
		if (!ai) console.error(`${TAG} AI Core did not decorate this plugin; TL;DR cannot summarise`)

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error(`${TAG} failed to register settings pages:`, error)
		}

		try {
			cleanup(patchMessageSheet())
		} catch (error) {
			console.error(`${TAG} failed to add the long-press row:`, error)
		}
	},

	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
