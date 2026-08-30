import type { GhostLogStorage } from "../types"

export function shouldIgnore(
	message: any,
	channelId: string,
	guildId: string | undefined,
	settings: GhostLogStorage,
): boolean {
	if (!message) return true

	if (settings.ignoreBots && message.author?.bot) return true
	if (message.author?.id && settings.ignoredUserIds?.includes(message.author.id)) return true
	if (settings.ignoredChannelIds?.includes(channelId)) return true
	if (guildId && settings.ignoredGuildIds?.includes(guildId)) return true

	return false
}
