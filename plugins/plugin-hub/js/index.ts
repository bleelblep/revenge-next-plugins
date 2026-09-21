/**
 * Plugin Hub -- a "Plugin Hub" row under Revenge's Plugins, with shortcuts into the settings of
 * the plugins you choose.
 *
 * Deliberately tiny and deliberately separate from AI Core: most of bleelblep's plugins do not
 * use AI, and a shortcut list has no business depending on one.
 *
 * Two facts about Revenge Next shape it, both confirmed in revenge-bundle-next's source:
 *
 * - **Opening a plugin needs nothing special.** Every running plugin with a settings page is
 *   registered as a route named after its id, so the hub opens one with `navigate(id)`.
 * - **Listing plugins needs Developer Mode.** The installed-plugin registry is only on the hidden
 *   API. So choosing plugins needs it switched on; using the hub, and removing entries, does not.
 */

import { DEFAULTS } from './defaults'
import { setStorage } from './lib/state'
import Manage from './ui/pages/Manage'
import { registerHub } from './ui/register'
import type { HubStorage } from './types'

export { DEFAULTS }
export type { HubStorage }

export default plugin<{ jsonStorage: HubStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		try {
			cleanup(registerHub())
		} catch (error) {
			console.error('[PluginHub] failed to register the Plugin Hub row:', error)
		}
	},

	// The plugin's own settings page, from Revenge's Plugins list, is the chooser.
	SettingsComponent: Manage,
})
