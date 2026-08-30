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
	/** Legacy entries may still contain attachments; new entries store them in the sidecar. */
	attachments?: { filename: string; url: string }[]
	sentAt: number
	deletedAt: number
}

export interface DeletedRichContent {
	messageId: string
	channelId: string
	deletedAt: number
	attachments?: { filename: string; url: string }[]
	embeds?: unknown[]
}

export type DeleteStyle = "overlay" | "text" | "off"

export interface GhostLogStorage {
	log: DeletedMessage[]
	maxEntries: number
	unlimitedEntries: boolean
	backupEnabled: boolean
	backupFilePath?: string
	saveEmbeds: boolean
	embedsPerFile: 50 | 100
	lastBackupAt?: number
	toastOnCatch: boolean
	deleteStyle: DeleteStyle
	logDeletions: boolean
	ignoredUserIds: string[]
	ignoredChannelIds: string[]
	ignoredGuildIds: string[]
	countOwnMessages: boolean
	ignoreBots: boolean
}
