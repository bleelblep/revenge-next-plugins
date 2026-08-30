import { shouldIgnore } from "./detect"
import { DEFAULTS } from "../defaults"
import { cancelScheduledBackup, encryptMessageText, scheduleBackup } from "./backup"
import { saveRichContent } from "./richContent"
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

function appendCapped(log: DeletedMessage[], entry: DeletedMessage, maxEntries: number): DeletedMessage[] {
	const deduped = log.filter(existing => existing.id !== entry.id)
	return [entry, ...deduped].slice(0, Math.max(1, maxEntries))
}

export function watchForDeletions(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>): () => void {
	const { onFluxEventDispatched } = revenge.discord.flux

	const handleMessage = (channelId: string, message: any, messageId?: string) => {
		const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
		const s = stores()
		if (!message) return

		const meta = describe(message, channelId)

		if (!settings.countOwnMessages) {
			const currentUserId = s.UserStore?.getCurrentUser?.()?.id
			if (currentUserId && message.author?.id === currentUserId) return
		}

		if (shouldIgnore(message, channelId, meta.guildId, settings)) return

		if (settings.logDeletions) {
			const id = String(messageId ?? message.id ?? "")
			if (!id) return

			const entry: DeletedMessage = {
				id,
				channelId,
				guildId: meta.guildId,
				authorId: message.author?.id ?? "",
				authorName: meta.authorName,
				channelName: meta.channelName,
				guildName: meta.guildName,
				authorAvatar: message.author?.avatar,
				guildIcon: meta.guildIcon,
				content: encryptMessageText(String(message.content ?? "")),
				sentAt: message.timestamp ? new Date(message.timestamp).getTime() : Date.now(),
				deletedAt: Date.now(),
			}
		saveRichContent(message, entry.id, entry.channelId, entry.deletedAt, settings)

			log(`Caught deletion from ${entry.authorName} in ${entry.channelName}`)
			const cap = settings.unlimitedEntries ? Infinity : settings.maxEntries
			const nextLog = appendCapped(settings.log ?? [], entry, cap)
			jsonStorage.set({ log: nextLog })
			scheduleBackup(jsonStorage)
			if (settings.toastOnCatch) toast(entry)
		}
	}

	const handle = (channelId: string, messageId: string) => {
		const message = stores().MessageStore?.getMessage?.(channelId, messageId)
		handleMessage(channelId, message, messageId)
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

	const unsubscribeUpdate = onFluxEventDispatched("MESSAGE_UPDATE", (payload: any) => {
		try {
			const message = payload?.message
			if (!message?.__vml_deleted) return payload
			const channelId = message.channel_id ?? payload.channelId
			if (!channelId) return payload
			handleMessage(String(channelId), message, String(message.id ?? ""))
		} catch (error) {
			console.error("[GhostLog] MESSAGE_UPDATE handler failed:", error)
		}
		return payload
	})

	return () => {
		cancelScheduledBackup()
		unsubscribeSingle()
		unsubscribeBulk()
		unsubscribeUpdate()
	}
}
