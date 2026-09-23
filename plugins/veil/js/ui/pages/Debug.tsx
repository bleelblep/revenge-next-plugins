import { DEFAULTS } from '../../defaults'
import { classifyStatus } from '../../lib/classify'
import { getStorage, patch } from '../../lib/state'
import { rowStatus } from '../../patches/rows'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/** Developer tools only, isolated from the settings (docs/plugin-design-language.md §7). */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const rows = rowStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Hooks" hasIcons>
						<TableRow
							label="Message rows"
							subLabel={
								rows.installed
									? 'Hooked'
									: 'Not hooked yet — open a channel, then look again'
							}
							icon={rowIcon('EyeSlashIcon', 'ic_hide')}
						/>
					</TableRowGroup>

					<TableRowGroup title="This session" hasIcons>
						<TableRow
							label="Blurred"
							subLabel={`${rows.blurred} message${rows.blurred === 1 ? '' : 's'}, including reply previews`}
							icon={rowIcon('EyeSlashIcon', 'ic_hide')}
						/>
						<TableRow
							label="Sent to AI Core"
							subLabel={`${classifyStatus.checked} judged in ${classifyStatus.calls} call${classifyStatus.calls === 1 ? '' : 's'}, ${classifyStatus.flagged} blurred, ${rows.queued} queued`}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
						/>
						{classifyStatus.lastError ? (
							<TableRow
								label="Last problem"
								subLabel={classifyStatus.lastError}
								icon={rowIcon('WarningIcon', 'ic_warning_24px')}
							/>
						) : null}
					</TableRowGroup>

					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="What was blurred and why, to logcat under ReactNativeJS. Never message text."
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => patch({ debugLogging: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
