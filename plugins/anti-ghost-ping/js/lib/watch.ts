import { appendCapped, pingReason } from "./detect"
import { DEFAULTS } from "../defaults"
import type { AntiGhostPingStorage, GhostPing } from "../types"

const log = (...m: any[]) => console.log("[AntiGhostPing]", ...m)

function stores() {
	return revenge.discord.flux.Stores as any
}

function describe(message: any, channelId: string) {
	const s = stores()
	const channel = s.ChannelStore?.getChannel?.(channelId)
	const guild = channel?.guild_id ? s.GuildStore?.getGuild?.(channel.guild_id) : undefined

	return {
		channelName: channel?.name ? `#${channel.name}` : "Direct message",
		guildId: channel?.guild_id as string | undefined,
		guildName: guild?.name as string | undefined,
		// Hashes are captured now rather than looked up later: by the time you read the log the
		// user may have changed avatar, or you may have left the server entirely.
		guildIcon: guild?.icon as string | undefined,
		authorName:
			message.author?.globalName ??
			message.author?.global_name ??
			message.author?.username ??
			"Unknown",
	}
}

function toast(entry: GhostPing) {
	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: `anti-ghost-ping:${entry.id}`,
			content: `Ghost ping from ${entry.authorName} in ${entry.channelName}`,
		})
	} catch (error) {
		console.error("[AntiGhostPing] Failed to show toast:", error)
	}
}

/**
 * Watches for deleted messages that pinged you.
 *
 * The timing is the whole trick: `onFluxEventDispatched` patches the dispatcher, so this runs
 * *before* Discord's own stores handle MESSAGE_DELETE and evict the message. By the time a plain
 * store listener fired, the content would already be gone.
 */
export function watchForGhostPings(jsonStorage: RevengeJsonStorageApi<AntiGhostPingStorage>): () => void {
	const { onFluxEventDispatched } = revenge.discord.flux

	const handle = (channelId: string, messageId: string) => {
		const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
		const s = stores()

		const currentUserId = s.UserStore?.getCurrentUser?.()?.id
		if (!currentUserId) return

		const message = s.MessageStore?.getMessage?.(channelId, messageId)
		// Only messages Discord had cached can be checked — anything off-screen is unknowable.
		if (!message) return

		if (settings.ignoredUserIds?.includes(message.author?.id)) return

		const reason = pingReason(message, currentUserId, settings)
		if (!reason) return

		const meta = describe(message, channelId)
		const entry: GhostPing = {
			id: messageId,
			channelId,
			guildId: meta.guildId,
			authorId: message.author?.id ?? "",
			authorName: meta.authorName,
			channelName: meta.channelName,
			guildName: meta.guildName,
			authorAvatar: message.author?.avatar,
			guildIcon: meta.guildIcon,
			content: String(message.content ?? "").slice(0, 500),
			reason,
			sentAt: message.timestamp ? new Date(message.timestamp).getTime() : Date.now(),
			deletedAt: Date.now(),
		}

		log(`Caught ${reason} ghost ping from ${entry.authorName} in ${entry.channelName}`)
		jsonStorage.set({ log: appendCapped(settings.log ?? [], entry, settings.maxEntries) })
		if (settings.toastOnCatch) toast(entry)
	}

	// Both handlers MUST return the payload. These are patches, not listeners -- a falsy return
	// cancels the event, which here would stop deleted messages disappearing from the UI at all.
	// See docs/porting-rules.md rule 2.
	const unsubscribeSingle = onFluxEventDispatched("MESSAGE_DELETE", (payload: any) => {
		try {
			handle(payload.channelId, payload.id)
		} catch (error) {
			console.error("[AntiGhostPing] MESSAGE_DELETE handler failed:", error)
		}
		return payload
	})

	const unsubscribeBulk = onFluxEventDispatched("MESSAGE_DELETE_BULK", (payload: any) => {
		try {
			for (const id of payload.ids ?? []) handle(payload.channelId, id)
		} catch (error) {
			console.error("[AntiGhostPing] MESSAGE_DELETE_BULK handler failed:", error)
		}
		return payload
	})

	return () => {
		unsubscribeSingle()
		unsubscribeBulk()
	}
}
