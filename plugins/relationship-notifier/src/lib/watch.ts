import { DEFAULTS } from "../defaults"
import type { EventKind, RelationshipEvent, RelationshipNotifierStorage } from "../types"

const log = (...m: any[]) => console.log("[RelationshipNotifier]", ...m)

/** Discord channel type 3. */
const GROUP_DM = 3

/**
 * Discord relationship types. RELATIONSHIP_REMOVE fires for all of them, so without this check
 * cancelling a friend request or unblocking someone would be reported as losing a friend.
 */
const RELATIONSHIP_FRIEND = 1

function stores() {
	return revenge.discord.flux.Stores as any
}

function toast(entry: RelationshipEvent) {
	const message =
		entry.kind === "friend"
			? `${entry.name} is no longer your friend`
			: entry.kind === "guild"
				? `You're no longer in ${entry.name}`
				: `Group DM "${entry.name}" closed`

	try {
		revenge.discord.actions.ToastActionCreators.open({
			key: `relationship-notifier:${entry.id}`,
			content: message,
		})
	} catch (error) {
		console.error("[RelationshipNotifier] Failed to show toast:", error)
	}
}

export function watchRelationships(
	jsonStorage: RevengeJsonStorageApi<RelationshipNotifierStorage>,
): () => void {
	const { onFluxEventDispatched } = revenge.discord.flux

	const record = (kind: EventKind, targetId: string, name: string, iconHash?: string) => {
		const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }

		if (kind === "friend" && !settings.watchFriends) return
		if (kind === "guild" && !settings.watchGuilds) return
		if (kind === "groupdm" && !settings.watchGroupDms) return

		const entry: RelationshipEvent = {
			id: `${kind}:${targetId}:${Date.now()}`,
			kind,
			targetId,
			name,
			iconHash,
			at: Date.now(),
		}

		log(`${kind}: ${name}`)
		jsonStorage.set({
			log: [entry, ...(settings.log ?? [])].slice(0, Math.max(1, settings.maxEntries)),
		})
		if (settings.toastOnEvent) toast(entry)
	}

	// Every handler below MUST return the payload. `onFluxEventDispatched` is a patch, not a
	// listener -- a falsy return cancels the event, which here would stop Discord processing the
	// removal at all. See docs/porting-rules.md rule 2.
	//
	// They also all read identity from the stores *before* returning, because these events are
	// exactly what causes Discord to evict that data. Afterwards there's nothing left to name.

	const unsubFriend = onFluxEventDispatched("RELATIONSHIP_REMOVE", (payload: any) => {
		try {
			const id = payload?.relationship?.id ?? payload?.relationshipId ?? payload?.id
			if (id) {
				// The type has to be read before the event is processed, same as the name below --
				// afterwards the relationship is gone and there is nothing to check. The payload
				// sometimes carries it too, so prefer that and fall back to the store.
				const type =
					payload?.relationship?.type ??
					stores().RelationshipStore?.getRelationshipType?.(id)

				// Only an actual friend counts. A cancelled request, a declined request or an
				// unblock all raise this same event and are not worth reporting.
				if (type === undefined || type === RELATIONSHIP_FRIEND) {
					const user = stores().UserStore?.getUser?.(id)
					record(
						"friend",
						id,
						user?.globalName ?? user?.global_name ?? user?.username ?? "Unknown user",
						user?.avatar,
					)
				}
			}
		} catch (error) {
			console.error("[RelationshipNotifier] RELATIONSHIP_REMOVE handler failed:", error)
		}
		return payload
	})

	const unsubGuild = onFluxEventDispatched("GUILD_DELETE", (payload: any) => {
		try {
			const guild = payload?.guild
			// `unavailable` means a server outage, not a departure -- Discord re-sends the guild
			// once it recovers. Reporting those would be pure noise.
			if (guild?.id && !guild.unavailable) {
				const known = stores().GuildStore?.getGuild?.(guild.id)
				record("guild", guild.id, known?.name ?? guild.name ?? "Unknown server", known?.icon)
			}
		} catch (error) {
			console.error("[RelationshipNotifier] GUILD_DELETE handler failed:", error)
		}
		return payload
	})

	const unsubChannel = onFluxEventDispatched("CHANNEL_DELETE", (payload: any) => {
		try {
			const channel = payload?.channel
			if (channel?.type === GROUP_DM) {
				const known = stores().ChannelStore?.getChannel?.(channel.id)
				const name =
					known?.name ||
					channel.name ||
					// Unnamed group DMs are displayed by their members.
					(known?.recipients ?? [])
						.map((rid: string) => stores().UserStore?.getUser?.(rid)?.username)
						.filter(Boolean)
						.join(", ") ||
					"Unnamed group"
				record("groupdm", channel.id, name, known?.icon)
			}
		} catch (error) {
			console.error("[RelationshipNotifier] CHANNEL_DELETE handler failed:", error)
		}
		return payload
	})

	return () => {
		unsubFriend()
		unsubGuild()
		unsubChannel()
	}
}
