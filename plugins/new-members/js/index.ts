import patchChat from './patches/chat'
import { reportError, setReporter } from '../../../shared/report'

export default plugin({
	start(api) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))

		// Enabling a plugin mid-session leaves its hooks half-applied (see ghost-log-native-beta).
		if (api.plugin.startedLate) {
			api.plugin.requireReload()
			return
		}

		try {
			api.cleanup(patchChat())
		} catch (error) {
			reportError('[NewMembers] chat patch failed:', error)
		}
	},

	stop(api) {
		api.plugin.requireReload()
	},
})
