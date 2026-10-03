/**
 * Veil -- messages blurred like a spoiler, revealed with a tap.
 *
 * Every rule is decided on the device (`lib/rules.ts`): words, people, channels, and described
 * rules. A described rule is written once by AI Core from the user's own words (`lib/topicAi.ts`,
 * one call per rule, only the description sent) and then matched like the Words list. 0.3.x sent
 * each message to the model instead; that is gone.
 *
 * Either way the blur is Discord's own spoiler, applied to the row just before it crosses to
 * native (`patches/rows.ts`), so the message store is never touched and turning the plugin off
 * puts everything back.
 *
 * AI Core is an **optional** dependency, as in Second Thoughts: without it described rules can't be
 * made (saved ones keep working), and `api.ai` is simply undefined.
 */

import { DEFAULTS } from './defaults'
import { setAi, setStorage, TAG } from './lib/state'
import patchMessageSheet from './patches/messageSheet'
import patchRows from './patches/rows'
import Settings from './ui/pages/Settings'
import { CATEGORY_ROUTE, registerPages } from './ui/routes'
import type { AiHandle, VeilStorage } from './types'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'

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

		// The changelog: clock icon on the settings page, "What's new" after an update.
		api.cleanup(setupChangelog(api, CHANGELOG))

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
		cleanup(() => setAi(undefined))

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
