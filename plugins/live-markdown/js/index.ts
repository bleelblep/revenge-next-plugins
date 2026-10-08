import { DEFAULTS, type LiveMarkdownStorage, callNative } from './native'
import Settings from './ui/Settings'
import { setStorage } from './ui/state'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'

export default plugin<{ jsonStorage: LiveMarkdownStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ jsonStorage, cleanup, plugin }) {
		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		setStorage(jsonStorage)
		// Native owns the values; bring the mirror in line.
		callNative('getSettings')
			.then((state: LiveMarkdownStorage) => {
				if (state && typeof state.headings === 'boolean') jsonStorage.set({ ...state })
			})
			.catch(error => console.error('[LiveMarkdown] getSettings failed:', error))
	},
	SettingsComponent: Settings,
})
