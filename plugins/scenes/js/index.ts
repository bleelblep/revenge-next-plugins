import { DEFAULTS, type Settings as Storage } from './model'
import { start } from './state'
import Settings from './ui/Settings'

export default plugin<{ jsonStorage: Storage }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start({ jsonStorage, cleanup }) {
		cleanup(start(jsonStorage))
		const settings = revenge.discord.modules.settings as any
		let unregister: (() => void) | undefined
		const unsubscribe = settings.onSettingsModulesLoaded(() => {
			unregister?.()
			unregister = settings.registerSettingsItem('bleelblep.scenes', {
				parent: null, type: 'route', useTitle: () => 'Scenes',
				screen: { route: 'bleelblep.scenes', getComponent: () => Settings },
			})
			settings.refreshSettings?.()
		})
		cleanup(() => { unsubscribe(); unregister?.(); settings.refreshSettings?.() })
	},
	SettingsComponent: Settings,
})
