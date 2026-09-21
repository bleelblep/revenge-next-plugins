/**
 * Second Thoughts — a send-guard that stays quiet.
 *
 * Patterns first, AI second and optional. That ordering is the design, not an implementation
 * detail:
 *
 * - `lib/secrets.ts` is pattern matching. It runs on every send, costs nothing, needs no key and
 *   no dependency, and catches the leaks nobody ever means to make. This is the plugin.
 * - `lib/gate.ts` and `lib/typos.ts` score a draft locally. They decide whether anything is worth
 *   asking about; they never hold a message themselves.
 * - Only then, and only if AI Core is installed and configured, is one draft sent for judgement.
 *
 * AI Core is declared as an **optional** dependency, so `api.ai` is simply `undefined` when it is
 * not installed. Nothing degrades in that case, because nothing above the patterns was ever
 * load-bearing — the judgement checks just never run, and the settings pages say so plainly
 * rather than offering switches that quietly do nothing.
 *
 * Everything fails open. A missing dependency, a dead network, a timeout, a hook that throws —
 * every one of those paths ends with the message being sent. A second opinion that is
 * unavailable has to be silence, never a blocked outbox.
 */

import { DEFAULTS } from './defaults'
import { setAi, setStorage } from './lib/state'
import patchSendMessage from './patches/sendMessage'
import Settings from './ui/pages/Settings'
import { CHECKS_ROUTE, registerPages } from './ui/routes'
import type { AiHandle, SecondThoughtsStorage } from './types'

export { DEFAULTS }
export type { SecondThoughtsStorage }

export default plugin<{ jsonStorage: SecondThoughtsStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)

		// Decorated on by AI Core. Undefined whenever that plugin is absent, disabled, or failed
		// to start -- all of which are ordinary states this plugin is expected to survive.
		const ai = (api as any).ai as AiHandle | undefined
		setAi(ai)
		cleanup(() => setAi(undefined))

		// Lets AI Core's settings screen link back here. Optional on both sides: an older AI Core
		// without the method, or no AI Core at all, simply means no link.
		try {
			ai?.setSettingsRoute?.(CHECKS_ROUTE)
		} catch (error) {
			console.error(
				'[SecondThoughts] could not register a settings route with AI Core:',
				error,
			)
		}

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error(
				'[SecondThoughts] failed to register settings pages:',
				error,
			)
		}

		try {
			cleanup(patchSendMessage())
		} catch (error) {
			console.error('[SecondThoughts] failed to guard sendMessage:', error)
		}
	},

	SettingsComponent: Settings,
})
