import { DEFAULTS } from '../../defaults'
import { registryStatus } from '../../lib/commands'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { CatchUpStorage } from '../../types'

/** Developer tools only. Reports outcomes, never intentions -- porting rule 3. */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<CatchUpStorage>) => storage?.set(patch)

	const registry = registryStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Prints how many messages were read and what was asked, to logcat under ReactNativeJS"
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => set({ debugLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Status" hasIcons>
						<TableRow
							label="Command registry"
							subLabel={
								registry.found
									? `Found via ${registry.via}. Commands can be registered.`
									: 'Not found yet. Open a channel and come back — it resolves when Discord loads its command modules.'
							}
							icon={rowIcon('SettingsIcon', 'ic_settings')}
						/>
						<TableRow
							label="Registered commands"
							subLabel={
								registry.registered.length
									? registry.registered.map(name => `/${name}`).join(', ')
									: 'None'
							}
							icon={rowIcon('SendMessageIcon', 'ic_send')}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Revenge Next has no command API, so this plugin registers its
						command by pushing into the array Discord keeps its own built-in
						commands in. If the registry is not found, that array has moved or
						been renamed in this Discord build. Nothing else breaks, but there
						is no way to run the command.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
