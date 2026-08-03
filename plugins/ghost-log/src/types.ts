export interface DeletedMessage {
	id: string
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	authorAvatar?: string
	guildIcon?: string
	content: string
	attachments?: { filename: string; url: string }[]
	sentAt: number
	deletedAt: number
}

export type DeleteStyle = "overlay" | "text" | "off"

export interface GhostLogStorage {
	log: DeletedMessage[]
	maxEntries: number
	unlimitedEntries: boolean
	backupEnabled: boolean
	backupFilePath?: string
	lastBackupAt?: number
	toastOnCatch: boolean
	deleteStyle: DeleteStyle
	logDeletions: boolean
	ignoredUserIds: string[]
	ignoredChannelIds: string[]
	ignoredGuildIds: string[]
	countOwnMessages: boolean
}
