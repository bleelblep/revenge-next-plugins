import { DEFAULTS, type LiveMarkdownStorage, callNative } from './native'
import Settings from './ui/Settings'
import { setStorage } from './ui/state'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'
import { reportError, setReporter } from '../../../shared/report'

export default plugin<{ jsonStorage: LiveMarkdownStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		setStorage(jsonStorage)
		// Native owns the values; bring the mirror in line.
		callNative('getSettings')
			.then((state: LiveMarkdownStorage) => {
				if (state && typeof state.headings === 'boolean') (jsonStorage as any).set({ ...DEFAULTS, ...state }, true)
			})
			.catch(error => reportError('[LiveMarkdown] getSettings failed:', error))
	},
	SettingsComponent: Settings,
})
