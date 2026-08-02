import { DEFAULTS } from "../../defaults"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { LOG_ROUTE, OPTIONS_ROUTE } from "../routes"
import type { RelationshipNotifierStorage } from "../../types"

/**
 * The root page, on the shared base layout (see ghost-log): the caveat that scopes the
 * whole plugin as a neutral notice card first (this is not a logger and nothing here is
 * dangerous, so no warning yellow), the outage note as a muted caption, then the history
 * in a group of its own, then the index.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<RelationshipNotifierStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const count = s.log?.length ?? 0

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{/* Direct Stack child with no wrapper -- Page already pads horizontally by 16. */}
					<Card variant="secondary">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text variant="text-md/semibold" style={{ textAlign: "center" }}>
								It can't tell who did it
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Discord sends the same event whether they removed you or you removed them, so
								your own actions get recorded too — same for leaving a server yourself. It
								records names only, never message content.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Server outages are ignored — Discord marks those separately, so a server going
						down briefly won't be recorded as leaving it.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="History"
							subLabel={count ? `${count} recorded` : "Nothing yet"}
							icon={rowIcon("ClockIcon", "HistoryIcon")}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel="What to watch for, notifications"
							icon={rowIcon("SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
