import { callNativeMethod } from '../../lib/native'
import { DEFAULT_BACKUP_PATH, DEFAULTS } from '../../defaults'
import { getSettingsStorage, refreshLog, useLog } from '../state'
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
	const { ScrollView, Alert } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getSettingsStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries = useLog()
	const count = entries.length

	const toast = (content: string) =>
		revenge.discord.actions.ToastActionCreators.open({ key: 'ghost-log-native-beta-backup', content })

	const path = s.backupFilePath?.trim() || DEFAULT_BACKUP_PATH

	const setPath = (backupFilePath: string) => {
		void storage?.set({ backupFilePath } as Partial<GhostLogSettings>)
		toast(`Backup location set: ${backupFilePath}`)
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
		Alert.alert('Backup file location', 'Choose where encrypted backups are written.', [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Shared Download / SD card', onPress: () => setPath(DEFAULT_BACKUP_PATH) },
			{ text: 'More locations', onPress: more },
		])
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
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
