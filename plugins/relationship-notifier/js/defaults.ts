import type { RelationshipNotifierStorage } from "./types"

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it, so
 * `jsonStorage.cache` is genuinely undefined for a window after start.
 * See docs/porting-rules.md rule 7.
 */
export const DEFAULTS: RelationshipNotifierStorage = {
	log: [],
	maxEntries: 100,
	toastOnEvent: true,
	watchFriends: true,
	watchGuilds: true,
	watchGroupDms: true,
}
