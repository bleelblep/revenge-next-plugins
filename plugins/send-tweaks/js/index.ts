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
 */

import { DEFAULTS } from './defaults'
import { setStorage } from './lib/state'
import patchOutgoing from './patches/outgoing'
import patchReplyMention from './patches/replyMention'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { SendTweaksStorage } from './types'

export { DEFAULTS }
export type { SendTweaksStorage }

export default plugin<{ jsonStorage: SendTweaksStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start({ cleanup, jsonStorage, plugin }) {
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		setStorage(jsonStorage)

		// Applied independently -- one moved Discord module should cost one tweak, not all three.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[SendTweaks] failed to apply ${name}:`, error)
			}
		}

		apply('settings pages', registerPages)
		apply('outgoing messages', patchOutgoing)
		apply('reply mentions', patchReplyMention)
	},

	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
