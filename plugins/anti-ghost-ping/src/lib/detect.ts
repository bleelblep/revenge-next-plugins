import type { AntiGhostPingStorage, GhostPing } from "../types"

/**
 * Works out whether a message pinged the current user, and why.
 *
 * Returns the reason rather than a boolean so the log can show it — a "role" catch on a busy
 * server looks like a false positive otherwise, and each reason can be turned off individually.
 */
export function pingReason(
	message: any,
	currentUserId: string,
	settings: AntiGhostPingStorage,
): GhostPing["reason"] | undefined {
	if (!message || !currentUserId) return undefined
	// Your own deleted message pinging you isn't a ghost ping -- unless the test toggle is on,
	// which exists because otherwise this plugin can't be verified without a second account.
	if (message.author?.id === currentUserId && !settings.countOwnMessages) return undefined

	// `mentions` is a user array on a cached message, but a raw id array on some payload shapes.
	const mentioned = (message.mentions ?? []).some((m: any) =>
		typeof m === "string" ? m === currentUserId : m?.id === currentUserId,
	)
	if (mentioned && settings.catchDirect) return "direct"

	// Replying to you counts even without an explicit mention, as long as the ping wasn't
	// suppressed — that's what `mentions` above would have caught.
	if (settings.catchReplies) {
		const repliedAuthor = message.referenced_message?.author?.id ?? message.messageReference?.author?.id
		if (repliedAuthor === currentUserId) return "reply"
	}

	if (message.mention_everyone && settings.catchEveryone) return "everyone"

	// Role pings are opt-in: on a large server they fire constantly and drown the log.
	if (settings.catchRoles && Array.isArray(message.mention_roles) && message.mention_roles.length) {
		return "role"
	}

	return undefined
}

/** Trims to `maxEntries` and drops any duplicate of the same message id. */
export function appendCapped(log: GhostPing[], entry: GhostPing, maxEntries: number): GhostPing[] {
	const deduped = log.filter(existing => existing.id !== entry.id)
	return [entry, ...deduped].slice(0, Math.max(1, maxEntries))
}
