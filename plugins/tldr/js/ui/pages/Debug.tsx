import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { sheetStatus } from '../../patches/messageSheet'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { TldrStorage } from '../../types'

/** Developer tools only, isolated from the settings (docs/plugin-design-language.md §7). */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const sheet = sheetStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="This session" hasIcons>
						<TableRow
							label="Long-press menu"
							subLabel={
								sheet.lastKey
									? `Last sheet: ${sheet.lastKey}`
									: 'No sheet seen yet — long-press a message'
							}
							icon={rowIcon('TextIcon', 'ic_text')}
						/>
						<TableRow
							label="Summaries"
							subLabel={`Offered on ${sheet.offered} message${sheet.offered === 1 ? '' : 's'}, ${sheet.summarised} summarised`}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Lengths and cache hits to logcat under ReactNativeJS. Never message text."
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => storage?.set({ debugLogging: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
