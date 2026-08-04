import type { GhostLogSettings } from './types'

// User-visible shared location so the backup is portable/off-app. Parity with stable's SD option.
export const DEFAULT_BACKUP_PATH = '/storage/emulated/0/Download/GhostLog/deleted-log.backup.json'

// Parity with stable Ghost Log: own messages are NOT caught unless the user opts in for testing,
// deleted messages stay visible with a red overlay, log capped at 100, encrypted backup on.
export const DEFAULTS: GhostLogSettings = {
	countOwnMessages: false,
	logDeletions: true,
	toastOnCatch: false,
	deleteStyle: 'overlay',
	maxEntries: 100,
	unlimitedEntries: false,
	autoBackupEnabled: true,
	backupFilePath: DEFAULT_BACKUP_PATH,
}
