import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { CatchUpStorage } from '../../types'

/** Behaviour toggles only. Developer tools live on their own route. */
export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, Slider } =
		revenge.discord.design.Design

	// A plain navigator route, so there is no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<CatchUpStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup
						title={`How much to read — ${s.defaultCount} messages`}
					>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								Used when you run /catchup with no number. More messages cost
								more per call and give a broader summary, not a better one —
								past a few hundred the model starts flattening everything into
								generalities.
							</Text>
							<Slider
								step={25}
								value={s.defaultCount}
								minimumValue={25}
								maximumValue={s.maxCount}
								onValueChange={value =>
									set({ defaultCount: Math.round(value) })
								}
							/>
						</View>
					</TableRowGroup>

					<TableRowGroup title="Behaviour" hasIcons>
						<TableSwitchRow
							label="Skip bots"
							subLabel="Leave out webhooks and bot output. Turn this off for channels that are mostly automated."
							icon={rowIcon('WebhookIcon', 'ic_bot')}
							value={!!s.skipBots}
							onValueChange={value => set({ skipBots: value })}
						/>
						<TableSwitchRow
							label="Toast while working"
							subLabel="A brief notice that the messages are being read, so a slow call does not look like nothing happening."
							icon={rowIcon('BellIcon', 'ic_notification')}
							value={!!s.announce}
							onValueChange={value => set({ announce: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
