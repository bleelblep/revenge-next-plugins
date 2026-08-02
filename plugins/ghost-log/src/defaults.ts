import type { GhostLogStorage } from "./types"

export const DEFAULTS: GhostLogStorage = {
	log: [],
	maxEntries: 100,
	unlimitedEntries: false,
	toastOnCatch: false,
	deleteStyle: "overlay",
	logDeletions: true,
	ignoredUserIds: [],
	ignoredChannelIds: [],
	ignoredGuildIds: [],
	countOwnMessages: false,
}
