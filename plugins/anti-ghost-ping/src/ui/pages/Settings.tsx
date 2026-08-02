import { DEFAULTS } from "../../defaults"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { LOG_ROUTE, OPTIONS_ROUTE } from "../routes"
import type { AntiGhostPingStorage } from "../../types"

/**
 * The root page, on the shared base layout (see ghost-log): the message-logger warning as
 * a yellow-tinted card first (this plugin stores deleted message text -- that is the
 * category Discord is most known to action accounts over, so it stays unmissable), then
 * the cache caveat as a muted caption, then the log in a group of its own, then the index.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<AntiGhostPingStorage>
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
					{/*
					 * Yellow-tinted warning card, same as ghost-log's: no warning variant exists on
					 * Card, so the tint comes from `style`. Direct Stack child with no wrapper --
					 * Page already pads everything horizontally by 16.
					 */}
					<Card
						variant="secondary"
						border="none"
						style={{
							backgroundColor: "#f0b2321f",
							borderColor: "#f0b23266",
							borderWidth: 1,
						}}
					>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text
								color="text-feedback-warning"
								variant="text-md/semibold"
								style={{ textAlign: "center" }}
							>
								⚠️ This is a message logger
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								It keeps the text of deleted messages that pinged you, stored unencrypted on
								this device until you clear it. Client mods already break Discord's Terms of
								Service, and message loggers are the kind most associated with accounts being
								actioned. Only you can see the log, but the risk is yours.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Only messages Discord had loaded can be caught — a ping deleted in a channel you
						never opened was never cached.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Ghost ping log"
							subLabel={count ? `${count} caught` : "Nothing caught yet"}
							icon={rowIcon("BellSlashIcon")}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel="What counts as a ping, notifications, testing"
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
