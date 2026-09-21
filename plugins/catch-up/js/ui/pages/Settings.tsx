import { DEFAULTS } from '../../defaults'
import { getAi } from '../../lib/state'
import { rowIcon } from '../icon'
import { DEBUG_ROUTE, OPTIONS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { CatchUpStorage } from '../../types'

/**
 * Root index. The card explains the one thing that surprises people about this plugin: it can
 * only read what the client has already loaded, so the answer depends on how far you scrolled.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<CatchUpStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const ai = getAi()
	const budget = (() => {
		try {
			return ai?.budget()
		} catch {
			return undefined
		}
	})()

	const aiLine = !ai
		? 'AI Core is not available, so nothing can be summarised'
		: !budget?.configured
			? 'AI Core has no API key set'
			: `${budget.remaining} of ${budget.cap} calls left today`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Run /catchup in any channel
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								The summary appears as a message only you can see, and is never
								sent to Discord. It can only read what your client has already
								loaded, so a channel you have just opened has far less to work
								with than one you have scrolled through.
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel={`Reads ${s.defaultCount} messages by default`}
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="AI Core"
							subLabel={aiLine}
							icon={rowIcon('MagicWandIcon', 'ic_star')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Command registration and logging"
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
