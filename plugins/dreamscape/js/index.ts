import { DEFAULTS, type Settings as Storage } from './core/scenes'
import { start } from './core/state'
import Settings from './ui/Settings'

export default plugin<{ jsonStorage: Storage }>({
	jsonStorage: { load: true, default: DEFAULTS },
	start(api) {
		api.cleanup(start(api))
		const settings = revenge.discord.modules.settings as any
		let unregister: (() => void) | undefined
		const unsubscribe = settings.onSettingsModulesLoaded(() => {
			unregister?.()
			unregister = settings.registerSettingsItem('bleelblep.dreamscape', {
				parent: null, type: 'route', useTitle: () => 'Dreamscape',
				screen: { route: 'bleelblep.dreamscape', getComponent: () => Settings },
			})
			settings.refreshSettings?.()
		})
		api.cleanup(() => { unsubscribe(); unregister?.(); settings.refreshSettings?.() })
	},
	SettingsComponent: Settings,
})
