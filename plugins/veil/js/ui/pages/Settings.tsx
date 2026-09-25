import { DEFAULTS } from '../../defaults'
import { patch } from '../../lib/state'
import { rowIcon } from '../icon'
import {
	APPEARANCE_ROUTE,
	CATEGORY_ROUTE,
	DEBUG_ROUTE,
	RULES_ROUTE,
	WORDS_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import type { VeilStorage } from '../../types'

/**
 * The root index: context, the master switch, then one row per concern
 * (docs/plugin-design-language.md §2.2). Each row's sub-label says what is set, so the page
 * answers "what am I blurring?" without opening anything.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<VeilStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const count = (n: number, one: string, many = `${one}s`) =>
		`${n} ${n === 1 ? one : many}`
	const rulesLabel =
		s.channelIds.length || s.userIds.length
			? [
					s.userIds.length ? count(s.userIds.length, 'person', 'people') : '',
					s.channelIds.length ? count(s.channelIds.length, 'channel') : '',
				]
					.filter(Boolean)
					.join(', ')
			: s.sheetActions && (s.sheetBlurPerson || s.sheetBlurChannel)
				? 'None yet — long-press a message to add one'
				: 'None yet — turn on the long-press options below to add one'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Blurred like a spoiler, revealed with a tap
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Only you see the blur — nothing is sent to Discord and the
								messages themselves are never changed.
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Blur messages"
							subLabel="Off shows everything exactly as Discord would"
							icon={rowIcon('EyeSlashIcon', 'ic_hide')}
							value={!!s.enabled}
							onValueChange={value => patch({ enabled: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="What to blur" hasIcons>
						<TableRow
							label="Words"
							subLabel={
								s.words.length
									? `${count(s.words.length, 'word')}: ${s.words.slice(0, 3).join(', ')}${s.words.length > 3 ? '…' : ''}`
									: 'None yet'
							}
							icon={rowIcon('TextIcon', 'ic_text')}
							arrow
							onPress={() => navigation.navigate(WORDS_ROUTE)}
						/>
						<TableRow
							label="People and channels"
							subLabel={rulesLabel}
							icon={rowIcon('UserIcon', 'ic_profile_24px')}
							arrow
							onPress={() => navigation.navigate(RULES_ROUTE)}
						/>
						<TableRow
							label="Your own category"
							subLabel={
								s.customCategory
									? `“${s.customCategory}” in ${count(s.aiChannelIds.length, 'channel')}`
									: 'Off — describe something and AI Core judges it'
							}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
							arrow
							onPress={() => navigation.navigate(CATEGORY_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Long-press menu" hasIcons>
						<TableSwitchRow
							label="Veil options in the long-press menu"
							subLabel="Rows to blur a person or channel when you long-press a message. It's the only way to add those, so off means no new ones — existing ones keep working."
							icon={rowIcon('EyeSlashIcon', 'ic_hide')}
							value={!!s.sheetActions}
							onValueChange={value => patch({ sheetActions: value })}
						/>
						{s.sheetActions ? (
							<>
								<TableSwitchRow
									label="Blur this person"
									subLabel="“Blur messages from …” on other people's messages"
									icon={rowIcon('UserIcon', 'ic_profile_24px')}
									value={!!s.sheetBlurPerson}
									onValueChange={value => patch({ sheetBlurPerson: value })}
								/>
								<TableSwitchRow
									label="Blur this channel"
									subLabel="“Blur everything in …” for the channel you're in"
									icon={rowIcon('TextIcon', 'ic_text')}
									value={!!s.sheetBlurChannel}
									onValueChange={value => patch({ sheetBlurChannel: value })}
								/>
								<TableSwitchRow
									label="Check this channel with AI"
									subLabel={
										s.customCategory
											? `“Check this channel for ${s.customCategory}”. The only way to add a channel to your own category.`
											: 'Appears once you describe your own category'
									}
									icon={rowIcon('MagicWandIcon', 'ic_star')}
									value={!!s.sheetAiCheck}
									onValueChange={value => patch({ sheetAiCheck: value })}
								/>
							</>
						) : null}
					</TableRowGroup>

					<TableRowGroup title="Settings" hasIcons>
						<TableRow
							label="How it looks"
							subLabel={
								[
									s.blurMedia ? 'images blurred' : 'images shown',
									s.showReason ? 'reason shown' : 'no reason',
								].join(', ')
							}
							icon={rowIcon('PaintPaletteIcon', 'ic_theme_24px')}
							arrow
							onPress={() => navigation.navigate(APPEARANCE_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Hooks, counts and logging"
							icon={rowIcon('BugIcon', 'ic_debug')}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
