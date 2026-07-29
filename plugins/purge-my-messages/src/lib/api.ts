const { lookupModule } = revenge.modules.finders
const { withProps, withStoreName } = revenge.modules.finders.filters

const MessageActions = lookupModule<any>(withProps("deleteMessage"))?.[0]
const HTTPMod = lookupModule<any>(withProps("getAPIBaseURL"))?.[0]
const UserStore = lookupModule<any>(withStoreName("UserStore"))?.[0]
const ChannelStore = lookupModule<any>(withStoreName("ChannelStore"))?.[0]

export function currentUserId(): string | undefined {
	try {
		return UserStore?.getCurrentUser?.()?.id
	} catch {
		return undefined
	}
}

export function channelName(channelId: string): string {
	try {
		return ChannelStore?.getChannel?.(channelId)?.name || "unknown-channel"
	} catch {
		return "unknown-channel"
	}
}

export interface FoundMessage {
	id: string
	channelId: string
	/** Truncated preview text, not the full message -- this is for a confirmation summary. */
	preview: string
}

/** One page of "my messages in this guild", via the guild message-search REST endpoint,
 *  author_id pinned to the caller -- never call this with anyone else's id. */
export async function searchMyMessages(
	guildId: string,
	authorId: string,
	offset: number,
): Promise<{ results: FoundMessage[]; total: number }> {
	const res = await HTTPMod.get({
		url: `/guilds/${guildId}/messages/search`,
		query: { author_id: authorId, offset },
	})

	const body = res?.body ?? res
	const groups: any[] = Array.isArray(body?.messages) ? body.messages : []

	// Each group is the matched message plus surrounding context; only the actual hit is
	// ours to delete. Prefer an explicit `hit` marker, fall back to the whole group filtered
	// to our own author id if that marker isn't present on this build.
	const results: FoundMessage[] = []
	for (const group of groups) {
		if (!Array.isArray(group)) continue
		const hit = group.find((msg: any) => msg?.hit) ?? group.find((msg: any) => msg?.author?.id === authorId)
		if (!hit?.id || !hit?.channel_id) continue

		const channelId = String(hit.channel_id)
		const text =
			typeof hit.content === "string" && hit.content.trim()
				? hit.content.trim()
				: Array.isArray(hit.attachments) && hit.attachments.length
					? `[${hit.attachments.length} attachment${hit.attachments.length === 1 ? "" : "s"}]`
					: "[no text content]"

		results.push({
			id: String(hit.id),
			channelId,
			preview: `#${channelName(channelId)}: ${truncate(text, 60)}`,
		})
	}

	return { results, total: Number(body?.total_results) || 0 }
}

function truncate(text: string, max: number): string {
	const oneLine = text.replace(/\s+/g, " ")
	return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine
}

/**
 * `String(error)` on a thrown non-Error object gives the literal text "[object Object]".
 * This tries several places real detail tends to live before falling back.
 */
export function describeError(error: any): string {
	if (typeof error === "string") return error
	if (typeof error?.message === "string" && error.message) return error.message

	const body = error?.body ?? error?.response?.body
	if (typeof body?.message === "string") return body.message
	if (body) {
		try {
			return JSON.stringify(body)
		} catch {
			/* fall through */
		}
	}

	const status = error?.status ?? error?.response?.status
	if (status) return `HTTP ${status}`

	try {
		const json = JSON.stringify(error)
		if (json && json !== "{}") return json
	} catch {
		/* fall through */
	}

	return String(error)
}

export class RateLimited extends Error {
	constructor(public retryAfterMs: number) {
		super(`rate limited, retry after ${retryAfterMs}ms`)
	}
}

/** Throws RateLimited on a 429 rather than swallowing it, so the caller can back off and retry. */
export async function deleteOne(channelId: string, messageId: string): Promise<void> {
	try {
		await MessageActions.deleteMessage(channelId, messageId)
	} catch (error: any) {
		const status = error?.status ?? error?.response?.status ?? error?.body?.status
		if (status === 429 || HTTPMod?.isRateLimitedStatus?.(status)) {
			const retryAfterSecs =
				HTTPMod?.parseRetryAfter?.(error?.response ?? error) ?? error?.body?.retry_after ?? 5
			throw new RateLimited(Math.max(1000, Number(retryAfterSecs) * 1000))
		}
		throw error
	}
}
