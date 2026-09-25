/**
 * Plugin Hub -- a "Plugin Hub" section in Discord's settings, with shortcuts into the settings of
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
import { asVersion, formatVersion } from './lib/doctor'
import { setOwnVersion, setStorage } from './lib/state'
import HubSettings from './ui/pages/Settings'
import { registerHub } from './ui/register'
import type { HubStorage } from './types'

export { DEFAULTS }
export type { HubStorage }

export default plugin<{ jsonStorage: HubStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
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
		try {
			setOwnVersion(formatVersion(asVersion((plugin as any).manifest?.version)))
		} catch {
			/* the version row just says unknown */
		}

		try {
			cleanup(registerHub())
		} catch (error) {
			console.error('[PluginHub] failed to register the Plugin Hub row:', error)
		}
	},

	// Unpatching cannot put back everything a hook changed once Discord has rendered with it.
	stop(api) {
		api.plugin.requireReload()
	},

	// The plugin's own settings page, from Revenge's Plugins list, is Hub settings -- the same screen
	// the Hub's settings icon opens. It links on to Choose plugins and to AI Hub settings.
	SettingsComponent: HubSettings,
})
