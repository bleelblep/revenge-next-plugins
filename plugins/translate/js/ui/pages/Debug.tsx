import { DEFAULTS } from '../../defaults'
import { cooldownStatus, PROVIDERS, resetCooldowns } from '../../lib/providers'
import { getStorage } from '../../lib/state'
import { lastTranslateOutcome } from '../../lib/translate'
import { autoStatus } from '../../patches/autoTranslate'
import { sheetStatus } from '../../patches/messageActionSheet'
import { rowStatus } from '../../patches/rowManager'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { TranslateStorage } from '../../types'

/** Developer tools only. Reports outcomes, never intentions -- porting rule 3. */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<TranslateStorage>) => storage?.set(patch)

	const sheet = sheetStatus()
	const row = rowStatus()
	const auto = autoStatus()
	const cooling = cooldownStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Prints the provider chain and its outcome to logcat under ReactNativeJS"
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => set({ debugLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Status" hasIcons>
						<TableRow
							label="Sheet row"
							subLabel={
								sheet.injected
									? 'The Translate row has been inserted at least once'
									: 'Not inserted yet — long-press a message with text in it'
							}
							icon={rowIcon('GlobeEarthIcon')}
						/>
						<TableRow
							label="Last sheet seen"
							subLabel={sheet.lastKey || 'None yet'}
							icon={rowIcon('ChatIcon', 'ic_message')}
						/>
						<TableRow
							label="Row rewriting"
							subLabel={
								row.installed
									? `Hooked. ${row.rewrites} row${row.rewrites === 1 ? '' : 's'} rewritten.`
									: 'Not hooked — translations cannot be shown in place'
							}
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
						/>
						<TableRow
							label="Automatic sweeps"
							subLabel={`${auto.sweeps} sweep${auto.sweeps === 1 ? '' : 's'}, ${auto.translated} translated, ${auto.skipped} skipped locally`}
							icon={rowIcon('ClockIcon', 'ic_timer')}
						/>
						<TableRow
							label="Last translation"
							subLabel={lastTranslateOutcome()}
							icon={rowIcon('LinkIcon', 'ic_link')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Services" hasIcons>
						{PROVIDERS.map(provider => {
							const cool = cooling.find(entry => entry.id === provider.id)
							return (
								<TableRow
									key={provider.id}
									label={provider.name}
									subLabel={
										cool
											? `Cooling down, ${cool.secondsLeft}s left`
											: 'Available'
									}
									icon={rowIcon(
										cool ? 'ClockIcon' : 'CircleCheckIcon',
										'ic_check',
									)}
								/>
							)
						})}
						{cooling.length ? (
							<TableRow
								label="Clear cooldowns"
								subLabel="Make every service available again right now"
								icon={rowIcon('RetryIcon', 'RefreshIcon', 'ic_refresh')}
								arrow
								onPress={() => resetCooldowns()}
							/>
						) : null}
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						A service that fails is skipped for five minutes, so one outage
						costs one request rather than one per translation. Cooldowns expire
						on their own — clearing them here is only useful when you have just
						fixed something, such as a network that was down.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
