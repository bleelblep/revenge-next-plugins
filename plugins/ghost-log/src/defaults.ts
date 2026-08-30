import type { GhostLogStorage } from "./types"

export const DEFAULTS: GhostLogStorage = {
	log: [],
	maxEntries: 100,
	unlimitedEntries: false,
	backupEnabled: true,
	backupFilePath: "",
	saveEmbeds: true,
	embedsPerFile: 100,
	toastOnCatch: false,
	deleteStyle: "overlay",
	logDeletions: true,
	ignoredUserIds: [],
	ignoredChannelIds: [],
	ignoredGuildIds: [],
	countOwnMessages: false,
	ignoreBots: false,
}
