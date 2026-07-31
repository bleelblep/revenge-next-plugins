export interface GhostPing {
	/** Message id, also used to de-duplicate. */
	id: string
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	/** Avatar hash, captured at catch time — the user may have changed it or left by the time you look. */
	authorAvatar?: string
	/** Guild icon hash, same reasoning. */
	guildIcon?: string
	content: string
	/** Why this counted as a ping — shown in the log so false positives are debuggable. */
	reason: "direct" | "reply" | "everyone" | "role"
	/** Epoch millis the message was sent. */
	sentAt: number
	/** Epoch millis the deletion was seen. */
	deletedAt: number
}

export interface AntiGhostPingStorage {
	/** Newest first, capped at `maxEntries`. */
	log: GhostPing[]
	maxEntries: number
	toastOnCatch: boolean
	catchDirect: boolean
	catchReplies: boolean
	catchEveryone: boolean
	catchRoles: boolean
	/** Ignore pings from these user ids. */
	ignoredUserIds: string[]
	/**
	 * Count your own deleted messages. Off by default — pinging yourself isn't a ghost ping —
	 * but it's the only way to verify the plugin works without a second account.
	 */
	countOwnMessages: boolean
}
