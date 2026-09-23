import { DEFAULTS } from '../../defaults'
import { classifyStatus, resetClassifier } from '../../lib/classify'
import { repaintChannel } from '../../lib/repaint'
import { channelName, getAi, getStorage, patch, toggleId } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/**
 * The one part of this plugin that costs money and sends text off the device, so it says so
 * before anything else and lists exactly which channels are affected.
 */
export default function Category() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, Card, TableRowGroup, TableRow, TextInput } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const channels: string[] = s.aiChannelIds ?? []

	// A draft, committed on blur: every keystroke would otherwise throw away the answers so far
	// and start the whole channel again.
	const [draft, setDraft] = React.useState(s.customCategory)

	const commit = () => {
		const next = draft.trim()
		if (next === s.customCategory) return
		patch({ customCategory: next })
		// Answers about the old wording are not answers about this one.
		resetClassifier()
		for (const id of channels) repaintChannel(id)
	}

	const ai = getAi()
	const budget = (() => {
		try {
			return ai?.budget()
		} catch {
			return undefined
		}
	})()

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								This one leaves your phone
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Messages in the channels below are sent to AI Core's provider to
								be judged against your description, and count against its daily
								cap. Words, people and channels are all checked on the device
								instead.
							</Text>
						</View>
					</Card>

					<TextInput
						label="Blur anything about"
						placeholder="diets and weight loss"
						description="In your own words. Leave it empty to switch this off."
						value={draft}
						returnKeyType="done"
						isClearable
						onChange={setDraft}
						onBlur={commit}
					/>

					<TableRowGroup hasIcons>
						<TableRow
							label="Save"
							subLabel={
								draft.trim() === s.customCategory
									? 'Saved'
									: `Blur anything about “${draft.trim()}”`
							}
							icon={rowIcon('CircleCheckIcon', 'ic_check')}
							disabled={draft.trim() === s.customCategory}
							onPress={commit}
						/>
						<TableRow
							label="AI Core"
							subLabel={
								!ai
									? 'Not installed, so nothing can be judged'
									: !budget?.configured
										? 'No API key set'
										: `${budget.remaining} of ${budget.cap} calls left today`
							}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
						/>
					</TableRowGroup>

					{s.customCategory ? (
						channels.length ? (
							<TableRowGroup title="Checked in — tap one to stop" hasIcons>
								{channels.map(id => (
									<TableRow
										key={id}
										label={channelName(id)}
										icon={rowIcon('TextIcon', 'ic_text')}
										onPress={() => {
											toggleId('aiChannelIds', id, false)
											repaintChannel(id)
										}}
									/>
								))}
							</TableRowGroup>
						) : (
							<Text color="text-muted" variant="text-sm/normal">
								No channels yet. Long-press a message in a channel and choose
								“Check this channel” to start there.
							</Text>
						)
					) : null}

					<TableRowGroup title="So far" hasIcons>
						<TableRow
							label="Judged"
							subLabel={`${classifyStatus.checked} message${classifyStatus.checked === 1 ? '' : 's'} in ${classifyStatus.calls} call${classifyStatus.calls === 1 ? '' : 's'}, ${classifyStatus.flagged} blurred`}
							icon={rowIcon('SpeedometerIcon', 'ic_analytics')}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
