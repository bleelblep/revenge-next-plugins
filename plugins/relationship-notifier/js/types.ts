export type EventKind = "friend" | "guild" | "groupdm"

export interface RelationshipEvent {
	/** `${kind}:${targetId}:${timestamp}` — unique per occurrence, so re-adds log separately. */
	id: string
	kind: EventKind
	targetId: string
	name: string
	/** Avatar or icon hash, captured at the time — it's unreachable once the relation is gone. */
	iconHash?: string
	at: number
}

export interface RelationshipNotifierStorage {
	/** Newest first, capped at `maxEntries`. */
	log: RelationshipEvent[]
	maxEntries: number
	toastOnEvent: boolean
	watchFriends: boolean
	watchGuilds: boolean
	watchGroupDms: boolean
}
