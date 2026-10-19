export type DeleteStyle = 'overlay' | 'text' | 'off'

export interface GhostLogSettings {
	/** Also log (and keep on screen) messages you delete yourself. Options > Include my own deleted messages. */
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
	/** Also keep the history of your own edits. */
	logOwnEdits: boolean
	/** Show those earlier versions above the message in chat. */
	showEditHistory: boolean
}
