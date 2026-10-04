/**
 * Send Tweaks -- small fixes applied to a message just before it leaves.
 *
 * Three of the most requested plugins that had no Revenge Next port, bundled because they all
 * live at the same moment: link cleaning (the most wanted unported plugin by a wide margin), replies
 * that do not ping by default, and your own find-and-replace rules. One hook on sending instead of
 * three plugins fighting over it.
 *
 * Nothing here touches anything but the text of an outgoing message, and nothing ever runs on
 * text inside a code block. A message this plugin has nothing to say about is sent exactly as it
 * would have been without it.
 *
 * AI Core is an **optional** dependency: with it installed, the Ready-made screens can write a rule
 * from a description (`lib/aiRule.ts`). Without it, `api.ai` is undefined and nothing AI-related shows.
 */

import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { DEFAULTS } from './defaults'
import { refreshClearUrlsIfStale } from './lib/clearurls'
import { patchComposer } from './lib/composer'
import { setAi, setRequireReload, setStorage } from './lib/state'
import patchOutgoing from './patches/outgoing'
import patchReplyMention from './patches/replyMention'
import patchSendButton from './patches/sendButton'
import Settings from './ui/pages/Settings'
import { AI_ROUTE, registerPages } from './ui/routes'
import type { AiHandle, SendTweaksStorage } from './types'

export { DEFAULTS }
export type { SendTweaksStorage }

export default plugin<{ jsonStorage: SendTweaksStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage, plugin } = api
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		setStorage(jsonStorage)
		setRequireReload(() => plugin.requireReload())
		cleanup(() => setRequireReload(undefined))

		// Attached by AI Core's `decorate` when it is installed; undefined otherwise.
		const ai = (api as any).ai as AiHandle | undefined
		setAi(ai)
		// The one AI screen: where AI Core's settings and Plugin Hub's AI Hub send people.
		try {
			ai?.setSettingsRoute?.(AI_ROUTE)
		} catch (error) {
			console.error('[SendTweaks] could not register a settings route with AI Core:', error)
		}
		cleanup(() => setAi(undefined))

		// Applied independently -- one moved Discord module should cost one tweak, not all three.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[SendTweaks] failed to apply ${name}:`, error)
			}
		}

		apply('settings pages', registerPages)
		apply('changelog', () => setupChangelog(api, CHANGELOG))
		apply('outgoing messages', patchOutgoing)
		apply('reply mentions', patchReplyMention)
		apply('live composer', patchComposer)
		apply('send button', patchSendButton)

		// The ClearURLs rules refresh themselves about weekly. Checked a little after start: storage is
		// read without being awaited (`load: true`), and until it lands the defaults say "never
		// downloaded", which would fetch on every launch.
		const refresh = setTimeout(() => {
			try {
				refreshClearUrlsIfStale()
			} catch (error) {
				console.error('[SendTweaks] ClearURLs refresh failed:', error)
			}
		}, 8000)
		cleanup(() => clearTimeout(refresh))
	},

	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
