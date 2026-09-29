/**
 * Catch Up's slash commands and clientside replies. The helper itself is shared
 * (`shared/commands.ts`); fix it there, not here.
 */
export {
	argument,
	OptionType,
	type ClientMessageOptions,
	type CommandArgument,
	type CommandContext,
	type CommandDefinition,
	type CommandOption,
} from '../../../../shared/commands'
import { createCommands } from '../../../../shared/commands'

export const { registerCommand, registryStatus, showClientMessage } =
	createCommands('Catch Up', 2)
