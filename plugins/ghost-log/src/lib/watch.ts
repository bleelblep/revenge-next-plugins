import { shouldIgnore } from "./detect"
import { DEFAULTS } from "../defaults"
import type { GhostLogStorage, DeletedMessage } from "../types"

const log = (...m: any[]) => console.log("[GhostLog]", ...m)

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
		guildIcon: guild?.icon as string | undefined,
		authorName:
			message.author?.globalName ??
			message.author?.global_name ??
			message.author?.username ??
			"Unknown",
	}
}

function toast(entry: DeletedMessage) {
	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: `ghost-log:${entry.id}`,
			content: `Message deleted by ${entry.authorName} in ${entry.channelName}`,
		})
	} catch (error) {
		console.error("[GhostLog] Failed to show toast:", error)
	}
}

function extractAttachments(message: any): DeletedMessage["attachments"] {
	const atts = message.attachments
	if (!Array.isArray(atts) || !atts.length) return undefined
	return atts.map((a: any) => ({
		filename: a.filename ?? "attachment",
		url: a.url ?? a.proxy_url ?? "",
	})).filter((a: { url: string }) => a.url)
}

function appendCapped(log: DeletedMessage[], entry: DeletedMessage, maxEntries: number): DeletedMessage[] {
	const deduped = log.filter(existing => existing.id !== entry.id)
	return [entry, ...deduped].slice(0, Math.max(1, maxEntries))
}

export function watchForDeletions(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>): () => void {
	const { onFluxEventDispatched } = revenge.discord.flux

	const handle = (channelId: string, messageId: string) => {
		const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
		const s = stores()

		const message = s.MessageStore?.getMessage?.(channelId, messageId)
		if (!message) return

		const meta = describe(message, channelId)

		if (!settings.countOwnMessages) {
			const currentUserId = s.UserStore?.getCurrentUser?.()?.id
			if (currentUserId && message.author?.id === currentUserId) return
		}

		if (shouldIgnore(message, channelId, meta.guildId, settings)) return

		if (settings.logDeletions) {
			const entry: DeletedMessage = {
				id: messageId,
				channelId,
				guildId: meta.guildId,
				authorId: message.author?.id ?? "",
				authorName: meta.authorName,
				channelName: meta.channelName,
				guildName: meta.guildName,
				authorAvatar: message.author?.avatar,
				guildIcon: meta.guildIcon,
				content: String(message.content ?? "").slice(0, 2000),
				attachments: extractAttachments(message),
				sentAt: message.timestamp ? new Date(message.timestamp).getTime() : Date.now(),
				deletedAt: Date.now(),
			}

			log(`Caught deletion from ${entry.authorName} in ${entry.channelName}`)
			const cap = settings.unlimitedEntries ? Infinity : settings.maxEntries
			jsonStorage.set({ log: appendCapped(settings.log ?? [], entry, cap) })
			if (settings.toastOnCatch) toast(entry)
		}
	}

	const unsubscribeSingle = onFluxEventDispatched("MESSAGE_DELETE", (payload: any) => {
		try {
			handle(payload.channelId, payload.id)
		} catch (error) {
			console.error("[GhostLog] MESSAGE_DELETE handler failed:", error)
		}
		return payload
	})

	const unsubscribeBulk = onFluxEventDispatched("MESSAGE_DELETE_BULK", (payload: any) => {
		try {
			for (const id of payload.ids ?? []) handle(payload.channelId, id)
		} catch (error) {
			console.error("[GhostLog] MESSAGE_DELETE_BULK handler failed:", error)
		}
		return payload
	})

	return () => {
		unsubscribeSingle()
		unsubscribeBulk()
	}
}
