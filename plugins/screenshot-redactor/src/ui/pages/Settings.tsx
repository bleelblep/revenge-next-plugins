import { DEFAULTS } from "../../defaults"
import { onEnabledChanged } from "../../lib/state"
import { refreshChat } from "../../lib/chatRows"
import { RELOAD_NOTICE_LONG, toggleToast } from "../../lib/notices"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { DEBUG_ROUTE, VISUALS_ROUTE } from "../routes"
import type { ScreenshotRedactorStorage } from "../../types"

// Read inside the component, never at module scope -- see docs/porting-rules.md rule 1.
function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: "ScreenshotRedactorToast", content })
}

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<ScreenshotRedactorStorage>
}) {
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableSwitchRow, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const settings = api.jsonStorage.use() ?? DEFAULTS

	function setEnabled(enabled: boolean) {
		api.jsonStorage.set({ enabled })
		onEnabledChanged(enabled)

		showToast(toggleToast(enabled, refreshChat()))
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none" style={{ backgroundColor: "#f0b2321f", borderColor: "#f0b23266", borderWidth: 1 }}>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-feedback-warning" variant="text-md/semibold" style={{ textAlign: "center" }}>
								⚠️ Message text is never touched
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Inline @mentions and the individual (1:1) DM header — name and avatar — are covered. A name someone typed out in a message is not, nor are group DM headers, server names, channel names or timestamps.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">{RELOAD_NOTICE_LONG}</Text>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Redact names and avatars"
							subLabel="Replaces every author in chat with a placeholder. Local only — nobody else sees any of this."
							icon={rowIcon("EyeSlashIcon")}
							value={!!settings.enabled}
							onValueChange={setEnabled}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Visual style"
							subLabel="Placeholder style, avatars, badges, numbering, whether to redact yourself"
							icon={rowIcon("PaintPaletteIcon", "PaintbrushThinIcon")}
							arrow
							onPress={() => navigation.navigate(VISUALS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Verbose logging, module probe, diagnostics"
							icon={rowIcon("BugIcon")}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
						<TableRow
							label="Reload Discord"
							subLabel="Marks the plugin as needing a reload, then reload when it suits you — the sure way to clear every leftover placeholder at once."
							icon={rowIcon("RefreshIcon")}
							onPress={() => {
								try {
									api.plugin.requireReload()
									showToast("Reload marked — reload Discord from the plugin list to finish.")
								} catch (error) {
									console.error("[ScreenshotRedactor] requireReload failed:", error)
									showToast("Couldn't mark for reload — see the log.")
								}
							}}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
