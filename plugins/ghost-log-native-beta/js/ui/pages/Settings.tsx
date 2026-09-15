import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import { LOG_ROUTE, OPTIONS_ROUTE, VISUALS_ROUTE, BACKUP_ROUTE, LICENSE_ROUTE, DEBUG_ROUTE } from '../routes'
import { useLog, useStorageStatus } from '../state'

/**
 * Root page for the native beta. Warning card (this is a message logger), then the Deleted
 * messages route in a group of its own. Backup / Visual style land in later parity phases, so the
 * index is intentionally lean for now.
 */
export default function Settings() {
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const entries = useLog()
	const status = useStorageStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card
						variant="secondary"
						border="none"
						style={{
							backgroundColor: '#f0b2321f',
							borderColor: '#f0b23266',
							borderWidth: 1,
						}}
					>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-feedback-warning" variant="text-md/semibold" style={{ textAlign: 'center' }}>
								⚠️ This is a message logger
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								This native beta stores deleted message text encrypted on this device. Client mods already
								break Discord's Terms of Service, and message loggers are the kind most associated with
								accounts being actioned. Only you can see the log, but the risk is yours.
							</Text>
						</View>
					</Card>

					{/* Fail loudly, on the page users actually land on. A backup location Android refuses
					    used to be silent, and silently losing every catch is the worst failure this
					    plugin has. */}
					{status?.usingFallback ? (
						<Card
							variant="secondary"
							border="none"
							style={{ backgroundColor: '#da373c1f', borderColor: '#da373c66', borderWidth: 1 }}
						>
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-feedback-critical" variant="text-md/semibold">
									Backup location unusable
								</Text>
								<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
									{`Android refused ${status.requestedDir}, and no permission exists that would allow it. Everything is being written to app storage instead. Open Backup to change the location or export a portable bundle.`}
								</Text>
							</View>
						</Card>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						Only messages Discord had loaded can be caught — one deleted in a channel you never opened was
						never cached.
					</Text>

					<TableRowGroup hasIcons>
						<TableRow
							label="Deleted messages"
							subLabel={entries.length ? `${entries.length} caught` : 'Nothing caught yet'}
							icon={rowIcon('TrashIcon', 'ic_trash')}
							arrow
							onPress={() => navigation.navigate(LOG_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Settings"
							subLabel="Logging, notifications, limits"
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(OPTIONS_ROUTE)}
						/>
						<TableRow
							label="Backup"
							subLabel="Encrypted backup location and restore"
							icon={rowIcon('FolderIcon', 'ic_folder')}
							arrow
							onPress={() => navigation.navigate(BACKUP_ROUTE)}
						/>
						<TableRow
							label="Visual style"
							subLabel="How deleted messages appear in chat"
							icon={rowIcon('PaintPaletteIcon', 'PaintbrushThinIcon')}
							arrow
							onPress={() => navigation.navigate(VISUALS_ROUTE)}
						/>
						<TableRow
							label="Licence"
							subLabel="CC0-1.0, with parts under BSD-3-Clause"
							icon={rowIcon('BookCheckIcon', 'InformationIcon', 'ic_info')}
							arrow
							onPress={() => navigation.navigate(LICENSE_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Message-load probe for the restore feature"
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
