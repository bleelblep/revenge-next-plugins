import { hiddenFolderIds, hiddenIds } from "../../lib/hidden"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { DEBUG_ROUTE, SERVERS_ROUTE } from "../routes"
import type { HideServersDrawerStorage } from "../../index"

// Same ToastActionCreators pattern as GuildRow/FolderRow -- revenge.utils.toast.show
// doesn't exist.
function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: "HideServersDrawerToast", content })
}

/**
 * The root page, on the shared base layout (see ghost-log): what the plugin does as a
 * notice card first, then the Servers toggles (the point of the plugin) in a group of
 * their own, then the Advanced index, and the Reload escape hatch last. The server list
 * itself, the legacy custom bar and the debug probes each live on their own route --
 * inline, the list swamped everything else on the page.
 *
 * The notice is a plain secondary card rather than the yellow warning card ghost-log and
 * anti-ghost-ping use: hiding servers is local and harmless, so it gets information
 * styling, not warning styling.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<HideServersDrawerStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }

	// Subscribed for the re-render, not the value: hiddenIds()/hiddenFolderIds() below stay
	// current as toggles flip on the Servers page and persist() writes through.
	api.jsonStorage.use()

	const servers = hiddenIds().length
	const folders = hiddenFolderIds().length
	const hiddenCount = servers + folders

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{/* Direct Stack child with no wrapper -- Page already pads horizontally by 16. */}
					<Card variant="secondary">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text variant="text-md/semibold" style={{ textAlign: "center" }}>
								Hiding is local to this device
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Nobody else sees any of this. The stock server bar does the hiding itself, so
								folders, unread badges and drag-to-reorder all behave exactly as stock.
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="Servers"
							subLabel={
								hiddenCount
									? `${servers} server${servers === 1 ? "" : "s"}, ${folders} folder${folders === 1 ? "" : "s"} hidden`
									: "Per-server and per-folder toggles — nothing hidden"
							}
							icon={rowIcon("FolderIcon", "ServerIcon", "ic_folder")}
							arrow
							onPress={() => navigation.navigate(SERVERS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Debug"
							subLabel="Legacy custom bar, stock-bar probes and module dumps"
							icon={rowIcon("BugIcon")}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Reload Discord"
							subLabel="Marks the plugin as needing a reload, then reload when it suits you."
							icon={rowIcon("RefreshIcon", "ic_refresh")}
							onPress={() => {
								try {
									api.plugin.requireReload()
									showToast("Reload marked — reload Discord from the plugin list to finish.")
								} catch (error) {
									console.error("[HideServersDrawer] requireReload failed:", error)
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
