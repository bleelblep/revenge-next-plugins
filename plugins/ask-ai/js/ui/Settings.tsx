import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { HELP } from '../lib/ask'
import { type AskAiStorage, update, useSettings } from '../lib/state'
import * as components from '@revenge-mod/components'
import { Design } from '@revenge-mod/discord/design'
import * as ReactNative from 'react-native'

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="How to use it">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								{HELP.replace(/\*\*|`/g, '')}
							</Text>
						</View>
					</TableRowGroup>

					<TableRadioGroup
						key={`length-${s.length}`}
						title="Answer length"
						defaultValue={s.length}
						onChange={(length: AskAiStorage['length']) => update({ length })}
					>
						<TableRadioRow label="Short" subLabel="A sentence or two." value="short" />
						<TableRadioRow label="Normal" subLabel="About a paragraph, longer when the question needs it." value="normal" />
						<TableRadioRow label="Long" subLabel="As much as the question needs. Uses more of AI Core's budget." value="long" />
					</TableRadioGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Show my question"
							subLabel="Quotes your question above the answer, so you can tell answers apart."
							icon={rowIcon('ChatIcon', 'ChatSmileIcon')}
							value={s.showQuestion}
							onValueChange={(showQuestion: boolean) => update({ showQuestion })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
