import { DEFAULTS } from "../../defaults"
import type { RelationshipNotifierStorage } from "../../types"
import { LOG_ROUTE, OPTIONS_ROUTE } from "../routes"

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<RelationshipNotifierStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const count = s.log?.length ?? 0

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup>
						<TableRow
							label="History"
							subLabel={count ? `${count} recorded` : "Nothing yet"}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
						<TableRow
							label="Settings"
							subLabel="What to watch for, notifications"
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
