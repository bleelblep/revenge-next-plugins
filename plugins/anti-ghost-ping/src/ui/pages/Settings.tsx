import { DEFAULTS } from "../../defaults"
import type { AntiGhostPingStorage } from "../../types"
import { LOG_ROUTE, OPTIONS_ROUTE } from "../routes"

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<AntiGhostPingStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	const count = s.log?.length ?? 0

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					{/*
					 * This plugin stores the text of deleted messages, which makes it a message
					 * logger. That is the category Discord is most known to action accounts over,
					 * so the warning goes first and unmissable rather than buried at the bottom.
					 */}
					<View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
						<Text
							color="text-feedback-critical"
							variant="text-md/semibold"
							style={{ textAlign: "center" }}
						>
							⚠️ This is a message logger
						</Text>
						<Text
							color="text-muted"
							variant="text-sm/normal"
							style={{ textAlign: "center", marginTop: 8 }}
						>
							It keeps the text of deleted messages that pinged you, stored unencrypted on this
							device until you clear it. Client mods already break Discord's Terms of Service, and
							message loggers are the kind most associated with accounts being actioned. Only you
							can see the log, but the risk is yours.
						</Text>
					</View>

					<TableRowGroup>
						<TableRow
							label="Ghost ping log"
							subLabel={count ? `${count} caught` : "Nothing caught yet"}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
						<TableRow
							label="Settings"
							subLabel="What counts as a ping, notifications, testing"
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
