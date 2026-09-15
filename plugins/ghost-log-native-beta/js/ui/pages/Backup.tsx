import { callNativeMethod } from '../../lib/native'
import {
	DEFAULT_BACKUP_PATH,
	DEFAULT_BUNDLE_PATH,
	DEFAULTS,
	SHARED_BACKUP_PATH,
	SHARED_BUNDLE_PATH,
} from '../../defaults'
import { getSettingsStorage, refreshLog, refreshStorageStatus, useLog, useStorageStatus } from '../state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { GhostLogSettings } from '../../types'

const ID = 'bleelblep.ghost-log-native-beta'

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return 'just now'
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

const APP_DOCS_PATH = 'documents/GhostLog/deleted-log.backup.json'
const APP_CACHE_PATH = 'cache/GhostLog/deleted-log.backup.json'

export default function Backup() {
	const { Page } = revenge.components
	const { ScrollView, Alert, View } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, Card, Text } = revenge.discord.design.Design

	const storage = getSettingsStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries = useLog()
	const count = entries.length
	const status = useStorageStatus()

	const toast = (content: string) =>
		revenge.discord.actions.ToastActionCreators.open({ key: 'ghost-log-native-beta-backup', content })

	const path = s.backupFilePath?.trim() || DEFAULT_BACKUP_PATH

	// Writing the setting is not enough: the whole base dir (log, shards, media) lives at this path
	// on the native side, and nothing re-pointed it. Export and import would immediately use the new
	// location while getLog still read the old one, so the log appeared to empty itself.
	const setPath = (backupFilePath: string) => {
		void (async () => {
			await storage?.set({ backupFilePath } as Partial<GhostLogSettings>)
			await callNativeMethod(`${ID}.setBaseDir`, [backupFilePath]).catch(() => {})
			const next = await refreshStorageStatus()
			await refreshLog()
			if (next?.usingFallback) {
				toast(`That location is unusable. Still writing to app storage.`)
			} else {
				toast(`Backup location set: ${backupFilePath}`)
			}
		})()
	}

	const choosePath = () => {
		const more = () => {
			Alert.alert('More backup locations', 'Pick an alternate path. Use back to cancel.', [
				{
					text: 'App docs (private)',
					onPress: () => setPath(APP_DOCS_PATH),
				},
				{
					text: 'App cache (private)',
					onPress: () => setPath(APP_CACHE_PATH),
				},
			])
		}
		Alert.alert(
			'Backup file location',
			'App storage always works but is erased if Discord is uninstalled. Shared storage survives that, but Android 11 and later usually refuse it and there is no permission that can be granted to change that. Use Export bundle to move a log between devices.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'App storage (default)', onPress: () => setPath(DEFAULT_BACKUP_PATH) },
				{ text: 'Shared Download / SD card', onPress: () => setPath(SHARED_BACKUP_PATH) },
				{ text: 'More locations', onPress: more },
			],
		)
	}

	const bundlePath = s.backupFilePath?.trim().startsWith('/') ? SHARED_BUNDLE_PATH : DEFAULT_BUNDLE_PATH

	const exportBundle = () => {
		void (async () => {
			const res = await callNativeMethod(`${ID}.exportBundle`, [bundlePath]).catch(() => null)
			if (res) toast(`Bundle written (${res.files} files, ${res.count} entries) to ${res.path}.`)
			else toast('Bundle export failed. Check the backup location.')
		})()
	}

	const askAndImportBundle = () => {
		Alert.alert(
			'Import bundle',
			`Replace the current log, rich content and saved media with the bundle at ${bundlePath}?`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Replace',
					style: 'destructive',
					onPress: () => {
						void (async () => {
							const restored = await callNativeMethod(`${ID}.importBundle`, [bundlePath]).catch(() => -1)
							await refreshLog()
							if (typeof restored === 'number' && restored >= 0) toast(`Imported ${restored} entries from the bundle.`)
							else toast('No importable bundle found at that location.')
						})()
					},
				},
			],
		)
	}

	const runBackup = () => {
		if (!storage || count <= 0) return
		void (async () => {
			const res = await callNativeMethod(`${ID}.exportBackup`, [path])
			if (res) {
				storage.set({ lastBackupAt: Date.now() } as Partial<GhostLogSettings>)
				toast(`Encrypted backup saved (${res.count} entries) to ${res.path}.`)
			} else {
				toast('Backup failed. Check the backup location.')
			}
		})()
	}

	const askAndRestore = () => {
		Alert.alert('Restore backup', `Merge encrypted backup from ${path} into the current log?`, [
			{ text: 'Cancel', style: 'cancel' },
			{
				text: 'Restore',
				onPress: () => {
					void (async () => {
						const added = await callNativeMethod(`${ID}.importBackup`, [path])
						await refreshLog()
						if (typeof added === 'number' && added >= 0) {
							toast(`Restored ${added} deleted message${added === 1 ? '' : 's'}.`)
						} else {
							toast('No restorable backup found at that location.')
						}
					})()
				},
			},
		])
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{/* Fail loudly. A location Android refuses used to be invisible: the plugin looked
					    like it was working and lost every catch. */}
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
									{`Android refused ${status.requestedDir}. Discord has no permission that can be granted to change this, so the log is being written to app storage instead. Pick an app storage location below, and use Export bundle to keep a portable copy.`}
								</Text>
							</View>
						</Card>
					) : null}

					{status?.lastWriteError ? (
						<Card
							variant="secondary"
							border="none"
							style={{ backgroundColor: '#f0b2321f', borderColor: '#f0b23266', borderWidth: 1 }}
						>
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-feedback-warning" variant="text-md/semibold">
									Last write failed
								</Text>
								<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
									{status.lastWriteError}
								</Text>
							</View>
						</Card>
					) : null}

					<TableRowGroup title="Portable bundle" hasIcons>
						<TableRow
							label="Export bundle (.zip)"
							subLabel={`Writes the encrypted log, rich content and saved media as one archive at ${bundlePath}.`}
							icon={rowIcon('DownloadIcon', 'ic_download')}
							disabled={count <= 0}
							onPress={exportBundle}
						/>
						<TableRow
							label="Import bundle (.zip)"
							subLabel="Replaces the current log, rich content and media with an exported archive."
							icon={rowIcon('UploadIcon', 'ic_upload')}
							onPress={askAndImportBundle}
						/>
					</TableRowGroup>

					<TableRowGroup title="Encrypted backup" hasIcons>
						<TableRow
							label="Create encrypted backup"
							subLabel={
								count > 0
									? s.lastBackupAt
										? `Last backup ${ago(s.lastBackupAt)}. Saves ${count} entries now.`
										: `Saves ${count} entries now.`
									: 'Disabled until at least one deleted message is logged.'
							}
							icon={rowIcon('DownloadIcon', 'ic_download')}
							disabled={count <= 0}
							onPress={runBackup}
						/>
						<TableRow
							label="Restore from encrypted backup"
							subLabel="Always available. Merges backup entries into this log."
							icon={rowIcon('UploadIcon', 'ic_upload')}
							onPress={askAndRestore}
						/>
						<TableRow
							label="Backup location"
							subLabel={path}
							icon={rowIcon('FolderIcon', 'ic_folder')}
							arrow
							onPress={choosePath}
						/>
						<TableRow
							label="Last backup"
							subLabel={s.lastBackupAt ? ago(s.lastBackupAt) : 'No backup has been written yet.'}
							icon={rowIcon('ClockIcon', 'ic_clock')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notes">
						<TableRow label="Overwrite behavior" subLabel="Every backup write replaces the selected file." />
						<TableRow
							label="Storage note"
							subLabel="The log itself is always encrypted on-device. Backups are an encrypted copy for portability."
						/>
						<TableRow
							label="Where the log is now"
							subLabel={status?.baseDir ?? 'Not reported yet.'}
						/>
						<TableRow
							label="Shared storage"
							subLabel="Android 11 and later block writes to Download and the SD card for this app, and no permission exists that would allow it. Use Export bundle instead."
						/>
						<TableRow
							label="Bundle portability"
							subLabel="A bundle opens on any device running this plugin. Bundles written by versions before 0.5.0 are tied to the Discord package they came from and are read, but not written, in that older form."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
