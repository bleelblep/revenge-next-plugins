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
	saveEmbeds: boolean
	embedsPerFile: 50 | 100
	lastBackupAt?: number
	ignoreBots: boolean
}
