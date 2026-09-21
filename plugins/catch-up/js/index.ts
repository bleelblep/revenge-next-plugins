/**
 * Catch Up -- what you missed in this channel, as a message only you can see.
 *
 * `/catchup [count]` reads what Discord has already loaded for the channel, strips it to "who
 * said what", asks for a short brief and hands the result back through the client's own receive
 * path. Nothing is sent to Discord; nobody else sees anything.
 *
 * ## Two things worth knowing before reading the code
 *
 * **Revenge Next has no command API.** Classic Revenge shipped `vendetta.commands`; Next exposes
 * nothing equivalent, so `lib/commands.ts` reimplements the small part of it that matters by
 * pushing into Discord's own `BUILT_IN_COMMANDS` array. It is kept free of anything specific to
 * this plugin so it can move somewhere shared once a second plugin wants a command.
 *
 * **AI Core is required here, not optional.** Unlike Second Thoughts -- whose pattern checks are
 * the product and whose AI half is a bonus -- there is no useful local version of "summarise
 * this". Without a model this plugin has nothing to do, so the dependency is declared plainly
 * rather than pretending to degrade.
 */

import { DEFAULTS } from './defaults'
import { installCommand } from './lib/catchup'
import { setAi, setStorage } from './lib/state'
import Settings from './ui/pages/Settings'
import { OPTIONS_ROUTE, registerPages } from './ui/routes'
import type { AiHandle, CatchUpStorage } from './types'

export { DEFAULTS }
export type { CatchUpStorage }

export default plugin<{ jsonStorage: CatchUpStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start(api) {
		const { cleanup, jsonStorage } = api
		setStorage(jsonStorage)

		const ai = (api as any).ai as AiHandle | undefined
		setAi(ai)
		cleanup(() => setAi(undefined))

		if (!ai) {
			// A required dependency that is somehow absent is worth one loud line: everything
			// below still installs, and the settings page explains what is missing.
			console.error(
				'[CatchUp] AI Core did not decorate this plugin; /catchup cannot summarise',
			)
		}

		try {
			ai?.setSettingsRoute?.(OPTIONS_ROUTE)
		} catch (error) {
			console.error(
				'[CatchUp] could not register a settings route with AI Core:',
				error,
			)
		}

		try {
			cleanup(registerPages())
		} catch (error) {
			console.error('[CatchUp] failed to register settings pages:', error)
		}

		try {
			// Returns immediately; the command itself lands when Discord's command module does.
			cleanup(installCommand())
		} catch (error) {
			console.error('[CatchUp] failed to register /catchup:', error)
		}
	},

	SettingsComponent: Settings,
})
