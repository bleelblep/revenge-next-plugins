export type DeleteStyle = 'overlay' | 'text' | 'off'

export interface GhostLogSettings {
	countOwnMessages: boolean
	logDeletions: boolean
	toastOnCatch: boolean
	deleteStyle: DeleteStyle
	maxEntries: number
	unlimitedEntries: boolean
	autoBackupEnabled: boolean
	backupFilePath: string
	lastBackupAt?: number
}
