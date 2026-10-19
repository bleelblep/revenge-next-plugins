/**
 * Ask AI's slash command and private replies. The helper itself is shared
 * (`shared/commands.ts`); fix it there, not here.
 */
export { argument, OptionType } from '../../../../shared/commands'
import { createCommands } from '../../../../shared/commands'

export const { registerCommand, showClientMessage } = createCommands('Ask AI', 0)
