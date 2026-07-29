import { type FoundMessage, RateLimited, deleteOne, searchMyMessages } from "./api"

// Deliberately paced: this is a legitimate personal data-cleanup action, but firing requests
// as fast as the API allows reads as automated abusive behaviour to Discord's own systems
// regardless of intent. A fixed floor between calls, on top of whatever RateLimited backoff a
// 429 demands, keeps this looking like what it is instead of a script hammering the API.
const MIN_DELAY_MS = 1500

export interface CancelToken {
	cancelled: boolean
}

/** Collects every match up front rather than interleaving with deletes: deleting a message
 *  shifts later search result offsets underneath a paginated walk, which silently skips
 *  messages. Also what makes the preview-before-delete flow possible in the first place. */
export async function searchAllMyMessages(
	guildId: string,
	authorId: string,
	onProgress: (found: number) => void,
	token: CancelToken,
): Promise<FoundMessage[]> {
	const queue: FoundMessage[] = []
	let offset = 0

	for (;;) {
		if (token.cancelled) return queue

		const page = await searchMyMessages(guildId, authorId, offset)
		queue.push(...page.results)
		onProgress(queue.length)

		if (page.results.length === 0 || queue.length >= page.total) break
		offset += page.results.length

		await sleep(MIN_DELAY_MS)
	}

	return queue
}

export interface DeleteState {
	status: "deleting" | "done" | "cancelled"
	total: number
	deleted: number
	failed: number
}

export interface PurgeHandle {
	cancel: () => void
}

export function startDelete(
	messages: FoundMessage[],
	onUpdate: (state: DeleteState) => void,
): PurgeHandle {
	let cancelled = false
	const state: DeleteState = { status: "deleting", total: messages.length, deleted: 0, failed: 0 }

	;(async () => {
		onUpdate({ ...state })

		for (const msg of messages) {
			if (cancelled) {
				onUpdate({ ...state, status: "cancelled" })
				return
			}

			let attempt = 0
			for (;;) {
				try {
					await deleteOne(msg.channelId, msg.id)
					state.deleted++
					break
				} catch (error) {
					if (error instanceof RateLimited && attempt < 5) {
						attempt++
						await sleep(error.retryAfterMs)
						continue
					}
					state.failed++
					break
				}
			}

			onUpdate({ ...state })
			await sleep(MIN_DELAY_MS)
		}

		onUpdate({ ...state, status: "done" })
	})()

	return { cancel: () => { cancelled = true } }
}

function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms))
}
