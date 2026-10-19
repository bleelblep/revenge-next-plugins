/**
 * Ask AI: `/ai question: …` answers privately with AI Core.
 *
 * - lib/ask.ts: the command, the prompt, private replies and errors.
 * - lib/commands.ts: the shared slash-command helper.
 * - lib/state.ts: settings and the AI Core handle (AI Core decorates `api.ai`).
 */

import { setupChangelog } from '../../../shared/changelog'
import { CHANGELOG } from './changelog'
import { registerAi } from './lib/ask'
import { type AiHandle, DEFAULTS, type AskAiStorage, setAi, setStorage } from './lib/state'
import Settings from './ui/Settings'
import { reportError, setReporter } from '../../../shared/report'

const TAG = '[Ask AI]'

export default plugin<{ jsonStorage: AskAiStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(api.plugin)
		api.cleanup(() => setReporter(undefined))
		api.cleanup(setupChangelog(api, CHANGELOG))

		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		const ai = (api as any).ai as AiHandle | undefined
		setAi(ai)
		cleanup(() => setAi(undefined))
		// Still registered without it: /ai then answers with a private "AI Core isn't there" message.
		if (!ai) reportError(`${TAG} AI Core did not decorate this plugin; /ai can't answer`)

		try {
			cleanup(registerAi())
		} catch (error) {
			reportError(`${TAG} could not register /ai:`, error)
		}
	},

	SettingsComponent: Settings,
})
