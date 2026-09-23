/**
 * Veil -- messages blurred like a spoiler, revealed with a tap.
 *
 * Two layers, in this order:
 *
 * 1. **Local rules** (`lib/rules.ts`): words, people and channels. Instant, free, and nothing
 *    leaves the device.
 * 2. **A custom category** (`lib/classify.ts`): something described in the user's own words and
 *    judged by a model through AI Core, only in channels they opted in.
 *
 * Either way the blur is Discord's own spoiler, applied to the row just before it crosses to
 * native (`patches/rows.ts`), so the message store is never touched and turning the plugin off
 * puts everything back.
 *
 * AI Core is an **optional** dependency, as in Second Thoughts: without it the local rules are
 * the whole plugin, and `api.ai` is simply undefined.
 */

import { DEFAULTS } from './defaults'
import { resetClassifier } from './lib/classify'
import { setAi, setStorage, TAG } from './lib/state'
import patchMessageSheet from './patches/messageSheet'
import patchRows from './patches/rows'
import Settings from './ui/pages/Settings'
import { CATEGORY_ROUTE, registerPages } from './ui/routes'
import type { AiHandle, VeilStorage } from './types'

export { DEFAULTS }
export type { VeilStorage }

export default plugin<{ jsonStorage: VeilStorage }>({
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
		// So AI Core's own settings can link back to the page that spends its budget.
		try {
			ai?.setSettingsRoute?.(CATEGORY_ROUTE)
		} catch (error) {
			console.error(`${TAG} could not register a settings route with AI Core:`, error)
		}
		cleanup(() => {
			setAi(undefined)
			resetClassifier()
		})

		// Applied independently: a moved Discord module should cost one half, not both.
		const apply = (name: string, install: () => () => void) => {
			try {
				cleanup(install())
			} catch (error) {
				console.error(`${TAG} failed to apply ${name}:`, error)
			}
		}
		apply('settings pages', registerPages)
		apply('row blur', patchRows)
		apply('long-press rules', patchMessageSheet)
	},

	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
