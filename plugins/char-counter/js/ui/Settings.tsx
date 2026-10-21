import { FieldRow } from './fieldGroup'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { type CharCounterStorage, DEFAULTS, FONT_SIZE, SPLIT_DELAY, SPLIT_MAX } from '../index'
import { badgeStatus, CounterSquare, fontSizeOf } from '../lib/badge'
import { counterStatus } from '../lib/counter'
import { delaySecondsOf, maxPartsOf, splitStatus } from '../lib/sender'
import { useChangelog } from '../../../../shared/changelog'
import * as components from '@revenge-mod/components'
import { Design } from '@revenge-mod/discord/design'
import * as ReactNative from 'react-native'

export default function Settings({ api }: { api: RevengePluginStartApi<CharCounterStorage> }) {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow, Slider } = Design as any

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const problem = [counterStatus.lastError, badgeStatus.lastError, splitStatus.lastError].filter(Boolean).join('\n')

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

					<TableRowGroup>
						<FieldRow label="Text size">
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
						</FieldRow>
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

					<TableRowGroup title="Long messages" hasIcons>
						<TableSwitchRow
							label="Split long messages"
							subLabel="Past the limit, the message goes out as several, cut at a blank line, a line break or the end of a sentence. Code blocks are closed and reopened."
							icon={rowIcon('ChatIcon', 'TextIcon')}
							value={!!s.split}
							onValueChange={(split: boolean) => api.jsonStorage.set({ split })}
						/>
						{s.split ? (
							<FieldRow
								label={`Wait between messages — ${delaySecondsOf(s)} s`}
								description="So the parts arrive in order and read as one. A channel's slowmode wins when it's longer."
							>
								<Slider
									step={SPLIT_DELAY.step}
									value={delaySecondsOf(s)}
									minimumValue={SPLIT_DELAY.min}
									maximumValue={SPLIT_DELAY.max}
									onValueChange={(value: number) => api.jsonStorage.set({ splitDelaySec: Math.round(value / SPLIT_DELAY.step) * SPLIT_DELAY.step })}
								/>
							</FieldRow>
						) : null}
						{s.split ? (
							<FieldRow
								label={`At most — ${maxPartsOf(s)} messages`}
								description="Anything longer is sent as typed, and Discord says it's too long."
							>
								<Slider
									step={1}
									value={maxPartsOf(s)}
									minimumValue={SPLIT_MAX.min}
									maximumValue={SPLIT_MAX.max}
									onValueChange={(value: number) => api.jsonStorage.set({ splitMax: Math.round(value) })}
								/>
							</FieldRow>
						) : null}
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
