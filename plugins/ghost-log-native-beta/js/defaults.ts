import type { GhostLogSettings } from './types'

/**
 * Storage locations.
 *
 * A RELATIVE path resolves against the app's private storage dir on the native side; an ABSOLUTE
 * one is used as given. The default is relative, and therefore always writable.
 *
 * The old default was the absolute shared path below. Discord's manifest declares neither
 * MANAGE_EXTERNAL_STORAGE nor requestLegacyExternalStorage, so from Android 11 on there is no
 * permission to request and no dialog to raise -- the app simply cannot create files there through
 * the file API. Every catch then threw out of the native handler. Users already configured on the
 * shared path keep it (native probes it, and falls back with a reason the UI shows) because on
 * older or vendor-lenient devices it does still work and it survives an uninstall.
 *
 * The replacement for that portability is the .zip bundle: export writes the whole encrypted log,
 * shards and media as one archive that imports on any device running this plugin.
 */
export const DEFAULT_BACKUP_PATH = 'GhostLog/deleted-log.backup.json'
export const SHARED_BACKUP_PATH = '/storage/emulated/0/Download/GhostLog/deleted-log.backup.json'
export const DEFAULT_BUNDLE_PATH = 'GhostLog/ghost-log-bundle.zip'
export const SHARED_BUNDLE_PATH = '/storage/emulated/0/Download/GhostLog/ghost-log-bundle.zip'

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
	saveEmbeds: true,
	embedsPerFile: 100,
	ignoreBots: false,
}
