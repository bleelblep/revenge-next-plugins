import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { watchDiscord } from './lib/discord'
import { stop as stopPronounDB } from './lib/pronounDB'
import { watchChannelMessages } from './lib/redraw'
import { DEFAULTS, setStorage, type PronounsStorage } from './lib/state'
import patchChat from './patches/chat'
import patchMessageSheet from './patches/messageSheet'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'
import { reportError, setReporter } from '../../../shared/report'

const TAG = '[Pronouns]'

function attempt(cleanup: (fn: () => void) => void, what: string, install: () => () => void) {
	try {
		cleanup(install())
	} catch (error) {
		reportError(`${TAG} ${what} failed:`, error)
	}
}

export default plugin<{ jsonStorage: PronounsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		// Enabling a plugin mid-session leaves its hooks half-applied (see ghost-log-native-beta).
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		attempt(cleanup, 'settings pages', registerPages)
		attempt(cleanup, 'changelog', () => setupChangelog(api, CHANGELOG))
		attempt(cleanup, 'profiles', watchDiscord)
		attempt(cleanup, 'message cache', watchChannelMessages)
		attempt(cleanup, 'chat tag', patchChat)
		attempt(cleanup, 'message sheet', patchMessageSheet)
	},

	stop(api) {
		stopPronounDB()
		api.plugin.requireReload()
	},

	SettingsComponent: Settings,
})
