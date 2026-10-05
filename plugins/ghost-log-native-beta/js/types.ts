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
	/** Keep the earlier versions of edited messages in the encrypted edit log. */
	logEdits: boolean
	/** Also keep the history of your own edits. Separate from countOwnMessages, which is a Debug tool. */
	logOwnEdits: boolean
	/** Show those earlier versions above the message in chat. */
	showEditHistory: boolean
}
