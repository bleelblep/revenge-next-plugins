import type { AntiGhostPingStorage } from "./types"

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it, so
 * `jsonStorage.cache` is genuinely undefined for a window after start.
 * See docs/porting-rules.md rule 7.
 */
export const DEFAULTS: AntiGhostPingStorage = {
	log: [],
	maxEntries: 50,
	toastOnCatch: true,
	catchDirect: true,
	catchReplies: true,
	catchEveryone: false,
	// Off by default: on a busy server role pings fire constantly and bury the real ones.
	catchRoles: false,
	ignoredUserIds: [],
	countOwnMessages: false,
}
