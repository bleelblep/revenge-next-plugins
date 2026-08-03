import { DEFAULTS } from "../../defaults"
import { restoreBackupIntoStorage, saveBackupFromStorage } from "../../lib/backup"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { GhostLogStorage } from "../../types"

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return "just now"
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

export default function Backup() {
	const { Page } = revenge.components
	const { ScrollView, Alert } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entryCount = s.log?.length ?? 0
	const APP_DOCS_PATH = "documents/GhostLog/deleted-messages.backup.v1.json"
	const APP_CACHE_PATH = "cache/GhostLog/deleted-messages.backup.v1.json"
	const SHARED_DOWNLOADS_PATH = "/storage/emulated/0/Download/GhostLog/deleted-messages.backup.v1.json"
	const setBackupPath = (backupFilePath: string) => {
		if (!storage) return
		void (async () => {
			await storage.set({ backupFilePath } as Partial<GhostLogStorage>)
			revenge.discord.actions.ToastActionCreators.open({
				key: "ghost-log:backup-path-set",
				content: backupFilePath
					? `Backup path set: ${backupFilePath}`
					: "Backup path set: plugin folder default",
			})
		})()
	}

	const choosePath = () => {
		const showMoreLocations = () => {
			Alert.alert("More backup locations", "Pick an alternate path. Use back to cancel.", [
				{
					text: "App docs (private)",
					onPress: () => setBackupPath(APP_DOCS_PATH),
				},
				{
					text: "App cache (private)",
					onPress: () => setBackupPath(APP_CACHE_PATH),
				},
				{
					text: "Shared Download / SD card",
					onPress: () => setBackupPath(SHARED_DOWNLOADS_PATH),
				},
			])
		}

		Alert.alert(
			"Backup file location",
			"Choose where encrypted backups are written.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Plugin folder (default)",
					onPress: () => setBackupPath(""),
				},
				{
					text: "More locations",
					onPress: showMoreLocations,
				},
			],
		)
	}

	const runBackup = () => {
		if (!storage || entryCount <= 0) return
		void (async () => {
			const result = await saveBackupFromStorage(storage, undefined, true)
			if (result) {
				revenge.discord.actions.ToastActionCreators.open({
					key: "ghost-log:backup-now",
					content: `Encrypted backup saved (${entryCount} entries) to ${result.path}.`,
				})
			} else {
				revenge.discord.actions.ToastActionCreators.open({
					key: "ghost-log:backup-failed",
					content: "Backup failed. Check backup location.",
				})
			}
		})()
	}

	const askAndRestore = () => {
		if (!storage) return
		Alert.alert(
			"Restore backup",
			"Merge encrypted backup entries into your current deleted-messages log?",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Restore",
					onPress: () => {
						void (async () => {
							const result = await restoreBackupIntoStorage(storage, "merge")
							if (result.reason === "ok") {
								revenge.discord.actions.ToastActionCreators.open({
									key: "ghost-log:restore-ok",
									content: `Restored ${result.restored} deleted message${result.restored === 1 ? "" : "s"}.`,
								})
							} else {
								revenge.discord.actions.ToastActionCreators.open({
									key: "ghost-log:restore-miss",
									content: "No restorable backup found for this account/device.",
								})
							}
						})()
					},
				},
			],
		)
	}

	const locationLabel = s.backupFilePath?.trim()
		? s.backupFilePath
		: "Plugin storage folder (deleted-messages.backup.v1.json)"

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Encrypted backup" hasIcons>
						<TableRow
							label="Create encrypted backup"
							subLabel={
								entryCount > 0
									? s.lastBackupAt
										? `Last backup ${ago(s.lastBackupAt)}. Saves ${entryCount} entries now.`
										: `Saves ${entryCount} entries now.`
									: "Disabled until at least one deleted message is logged."
							}
							icon={rowIcon("DownloadIcon", "ic_download")}
							disabled={entryCount <= 0}
							onPress={runBackup}
						/>
						<TableRow
							label="Restore from encrypted backup"
							subLabel="Always available. Merges backup entries into this log."
							icon={rowIcon("UploadIcon", "ic_upload")}
							onPress={askAndRestore}
						/>
						<TableRow
							label="Backup location"
							subLabel={locationLabel}
							icon={rowIcon("FolderIcon", "ic_folder")}
							arrow
							onPress={choosePath}
						/>
						<TableRow
							label="Last backup"
							subLabel={s.lastBackupAt ? ago(s.lastBackupAt) : "No backup has been written yet."}
							icon={rowIcon("ClockIcon", "ic_clock")}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notes">
						<TableRow
							label="Overwrite behavior"
							subLabel="Every backup write replaces the selected file path."
						/>
						<TableRow
							label="Storage note"
							subLabel="Shared Download may fail on Android scoped-storage builds; if it does, use app docs or plugin folder."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
