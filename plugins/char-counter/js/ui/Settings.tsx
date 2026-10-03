import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { type CharCounterStorage, DEFAULTS, FONT_SIZE } from '../index'
import { badgeStatus, CounterSquare, fontSizeOf } from '../lib/badge'
import { counterStatus } from '../lib/counter'
import { useChangelog } from '../../../../shared/changelog'

export default function Settings({ api }: { api: RevengePluginStartApi<CharCounterStorage> }) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow, Slider } = revenge
		.discord.design.Design as any

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const problem = [counterStatus.lastError, badgeStatus.lastError].filter(Boolean).join('\n')

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						key={`show-${s.show}`}
						title="Show"
						description="In a small square above the message box, while you type. Past the limit it turns red and says how far over you are."
						hasIcons
						defaultValue={s.show}
						onChange={(show: CharCounterStorage['show']) => api.jsonStorage.set({ show })}
					>
						<TableRadioRow label="Characters typed" subLabel="45 characters" icon={rowIcon('TextIcon')} value="count" />
						<TableRadioRow label="Typed out of the limit" subLabel="45 / 4,000 characters" icon={rowIcon('TextIcon')} value="limit" />
						<TableRadioRow label="Characters left" subLabel="3,955 characters left" icon={rowIcon('TextIcon')} value="left" />
					</TableRadioGroup>

					<TableRadioGroup
						key={`side-${s.side}`}
						title="Side"
						hasIcons
						defaultValue={s.side}
						onChange={(side: CharCounterStorage['side']) => api.jsonStorage.set({ side })}
					>
						<TableRadioRow label="Left" icon={rowIcon('ArrowLargeLeftIcon', 'ArrowLeftIcon')} value="left" />
						<TableRadioRow label="Right" icon={rowIcon('ArrowLargeRightIcon', 'ArrowRightIcon')} value="right" />
					</TableRadioGroup>

					<TableRowGroup title="Text size">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}>
							<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
								<Text color="text-muted" variant="text-sm/normal">
									{`${fontSizeOf(s)} pt${fontSizeOf(s) === FONT_SIZE.default ? ' (default)' : ''}`}
								</Text>
								<CounterSquare text="45 characters" colour="text-muted" fontSize={fontSizeOf(s)} />
							</View>
							<Slider
								step={1}
								value={fontSizeOf(s)}
								minimumValue={FONT_SIZE.min}
								maximumValue={FONT_SIZE.max}
								onValueChange={(value: number) => api.jsonStorage.set({ fontSize: Math.round(value) })}
							/>
						</View>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Only near the limit"
							subLabel="Appears once a message is 90% of the way there"
							icon={rowIcon('EyeIcon', 'ic_eye')}
							value={!!s.onlyNearLimit}
							onValueChange={(value: boolean) => api.jsonStorage.set({ onlyNearLimit: value })}
						/>
					</TableRowGroup>

					{problem ? (
						<TableRowGroup title="Status" hasIcons>
							<TableRow label="Couldn't attach to the message box" subLabel={problem} icon={rowIcon('WarningIcon')} />
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
