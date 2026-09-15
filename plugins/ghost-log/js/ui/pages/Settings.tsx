import { DEFAULTS } from "../../defaults"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { LOG_ROUTE, OPTIONS_ROUTE, VISUALS_ROUTE, LICENSE_ROUTE, BACKUP_ROUTE, DEBUG_ROUTE } from "../routes"
import type { GhostLogStorage } from "../../types"

/**
 * The root page, formatted after PalmDevs' plugins: controls only, with explanations
 * carried by row subLabels and group `description`s rather than free-text info sections.
 * Top to bottom: the message-logger warning, the Deleted messages log in a group of its
 * own (the point of the plugin, separate from the configuration index), then the index of
 * settings sub-pages with the Licence row closing the page.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<GhostLogStorage>
}) {
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
					 * The warning as a yellow-tinted card. Card has no warning variant, so the
					 * tint comes from `style` (CardProps extends ViewProps). Yellow is Discord's
					 * #f0b232 status-warning, matching the text-feedback-warning title.
					 *
					 * Rendered directly as a Stack child with no wrapper padding: revenge's
					 * Page already pads everything horizontally by 16 (Page.tsx pagePadding),
					 * so an extra inset here made the card narrower than the TableRowGroups.
					 * Corner radius is left at Card's default so it matches the other cards.
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
								Deleted message text is stored in plugin storage and mirrored to an encrypted
								backup file by default. Client mods already break Discord's Terms of Service,
								and message loggers are the kind most associated with accounts being actioned.
								Only you can see the log, but the risk is yours.
							</Text>
						</View>
					</Card>

					{/*
					 * The caption as its own Stack child, not the group's `description` prop: the
					 * prop renders tight against its own card, which made the gaps around it
					 * uneven. As a Stack child it gets the same 24px spacing as the cards. No
					 * extra padding -- Page already pads by 16, keeping the text flush with the
					 * card edges.
					 */}
					<Text color="text-muted" variant="text-sm/normal">
						Only messages Discord had loaded can be caught — one deleted in a channel you
						never opened was never cached.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Deleted messages"
							subLabel={count ? `${count} caught` : "Nothing caught yet"}
							icon={rowIcon("TrashIcon", "ic_trash")}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel="Logging, notifications, limits"
							icon={rowIcon("SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="Backup"
							subLabel="Encrypted backup location and behavior"
							icon={rowIcon("FolderIcon", "ic_folder")}
							arrow
							onPress={() => navigation.navigate(BACKUP_ROUTE)}
						/>
						<TableRow
							label="Visual style"
							subLabel="How deleted messages appear in chat"
							icon={rowIcon("PaintPaletteIcon", "PaintbrushThinIcon")}
							arrow
							onPress={() => navigation.navigate(VISUALS_ROUTE)}
						/>
						<TableRow
							label="Licence"
							subLabel="CC0-1.0, with parts under BSD-3-Clause"
							icon={rowIcon("BookCheckIcon", "InformationIcon", "ic_info")}
							arrow
							onPress={() => navigation.navigate(LICENSE_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Testing tools and backup path diagnostics"
							icon={rowIcon("BugIcon", "ic_debug")}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
