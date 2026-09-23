/**
 * Translate -- long-press a message, read it in your language.
 *
 * ## No AI, deliberately
 *
 * Translation is a solved problem with free, fast, dedicated services behind it. A language
 * model in this path would be slower, cost money per message and translate worse. So this plugin
 * depends on nothing but Revenge itself -- no AI Core, no key, no account.
 *
 * ## Four services, tried in turn
 *
 * `lib/providers.ts` holds Google, Bing, Yandex and MyMemory behind one interface. Only MyMemory
 * is a documented public API; the other three are the endpoints their own web translators call.
 * They are free and good and they can break without notice, which is exactly why there are four
 * of them and why a failure cools that service down and moves to the next rather than surfacing
 * as a dead plugin.
 */

import { DEFAULTS } from './defaults'
import { resetCooldowns } from './lib/providers'
import { setStorage } from './lib/state'
import { resetTranslations } from './lib/translations'
import patchAutoTranslate from './patches/autoTranslate'
import patchMessageActionSheet from './patches/messageActionSheet'
import patchRowManager from './patches/rowManager'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import type { TranslateStorage } from './types'

export { DEFAULTS }
export type { TranslateStorage }

export default plugin<{ jsonStorage: TranslateStorage }>({
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

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error('[Translate] failed to register settings pages:', error)
		}

		// Applied independently -- one moved Discord module should cost one surface, not all of
		// them. Losing the sheet should still leave auto-translate working, and losing the row
		// hook should still leave the sheet row able to say so.
		const apply = (name: string, patch: () => () => void) => {
			try {
				cleanup(patch())
			} catch (error) {
				console.error(`[Translate] failed to apply ${name}:`, error)
			}
		}

		apply('row rewriting', patchRowManager)
		apply('message sheet', patchMessageActionSheet)
		apply('auto translate', patchAutoTranslate)

		// Neither cooldowns nor translations outlive the session: one is a fact about the last
		// few minutes, the other is a view of somebody else's message.
		cleanup(() => {
			resetCooldowns()
			resetTranslations()
		})
	},

	stop(api) {
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
