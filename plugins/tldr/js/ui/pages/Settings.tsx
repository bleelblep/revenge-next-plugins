import { DEFAULTS } from '../../defaults'
import { getAi } from '../../lib/state'
import { savedCount } from '../../lib/summarise'
import { rowIcon } from '../icon'
import { DEBUG_ROUTE, OFFER_ROUTE, SAVED_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { TldrStorage } from '../../types'

/**
 * The root index: context, then one row per concern with its current setting in the sub-label,
 * so the page answers "what will this do?" without opening anything
 * (docs/plugin-design-language.md §2.2).
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<TldrStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } =
		revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const saved = savedCount()

	const ai = getAi()
	const budget = (() => {
		try {
			return ai?.budget()
		} catch {
			return undefined
		}
	})()
	const aiLine = !ai
		? 'Not installed, so nothing can be summarised'
		: !budget?.configured
			? 'No API key set — add one under AI Core > Provider'
			: `${budget.remaining} of ${budget.cap} calls left today`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Long-press a long message, tap TL;DR
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								That message is sent to AI Core's provider and the gist comes back
								in a few lines only you see. Nothing is posted to the channel.
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="AI Core"
							subLabel={aiLine}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Settings" hasIcons>
						<TableRow
							label="When to offer it"
							subLabel={`Messages longer than ${s.minLength} characters`}
							icon={rowIcon('TextIcon', 'ic_text')}
							arrow
							onPress={() => navigation.navigate(OFFER_ROUTE)}
						/>
						<TableRow
							label="Saved summaries"
							subLabel={
								saved
									? `${saved} kept, so asking again is free`
									: 'None yet — each one you ask for is kept'
							}
							icon={rowIcon('FolderIcon', 'ic_folder')}
							arrow
							onPress={() => navigation.navigate(SAVED_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Counts and logging"
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
