/**
 * Turning a channel into something worth paying to summarise.
 *
 * Two jobs, and the second matters more than it looks:
 *
 * 1. Read what Discord already has. `MessageStore` only holds what the client has loaded, so a
 *    channel you have just opened has far less than you asked for. That is a hard limit, not a
 *    bug to work around — see the note on `available` below.
 * 2. Cut it down. A raw message list is mostly punctuation as far as a model is concerned:
 *    embeds, attachment metadata, reaction counts, snowflakes. Stripping to "who said what" is
 *    the difference between a cheap call and an expensive one, and makes the summary better
 *    rather than worse.
 */

export interface TranscriptLine {
	author: string
	content: string
}

export interface Transcript {
	lines: TranscriptLine[]
	/** How many messages the store actually had, before any limit was applied. */
	available: number
	/** Characters in the rendered transcript, for the cost estimate on the settings page. */
	characters: number
	text: string
	/**
	 * Every user id that appears in `text`, as an author or a mention. The model refers to people
	 * only by copying these; `lib/mentions.ts` drops any it did not get from here.
	 */
	userIds: Set<string>
}

const MENTION = /<@!?(\d+)>/g

/**
 * Message types that carry conversation. Everything else -- joins, pins, boosts, call starts --
 * is noise in a summary.
 *
 * 0 DEFAULT, 19 REPLY, 20 CHAT_INPUT_COMMAND, 21 THREAD_STARTER_MESSAGE, 23 CONTEXT_MENU_COMMAND.
 * 20 and 23 were missing at first, which quietly dropped every slash-command exchange in
 * channels that use them.
 */
const CONVERSATIONAL_TYPES = new Set([0, 19, 20, 21, 23])

/**
 * Who wrote a line: a mention, so the summary can name people by copying it and Discord renders
 * it as a tappable pill. The display name is only for a message with no author id.
 */
function authorLabel(message: any): string {
	const author = message?.author
	if (typeof author?.id === 'string') return `<@${author.id}>`
	return (
		message?.nick ??
		author?.globalName ??
		author?.global_name ??
		author?.username ??
		'someone'
	)
}

/**
 * Attachments and embeds are named, not included. "[image]" tells the model a picture was part of
 * the conversation, which is occasionally load-bearing, without spending tokens on a CDN URL
 * nobody can read anyway. Mentions stay as `<@id>`, the same form author lines use.
 */
function renderContent(message: any): string {
	const parts: string[] = []
	const content =
		typeof message?.content === 'string' ? message.content.trim() : ''
	if (content) parts.push(content)

	const attachments = Array.isArray(message?.attachments)
		? message.attachments.length
		: 0
	if (attachments)
		parts.push(`[${attachments} attachment${attachments === 1 ? '' : 's'}]`)

	const embeds = Array.isArray(message?.embeds) ? message.embeds.length : 0
	if (embeds && !content) parts.push('[embed]')

	return parts.join(' ')
}

export function buildTranscript(
	channelId: string,
	limit: number,
	skipBots = true,
): Transcript {
	const empty: Transcript = {
		lines: [],
		available: 0,
		characters: 0,
		text: '',
		userIds: new Set(),
	}

	let messages: any[]
	try {
		const store = (revenge.discord.flux.Stores as any)?.MessageStore
		const result = store?.getMessages?.(channelId)
		// `getMessages` returns a collection wrapper, not an array, and its shape has moved
		// between builds. Take whichever of the two it is rather than assuming.
		messages =
			result?._array ??
			result?.toArray?.() ??
			(Array.isArray(result) ? result : [])
	} catch (error) {
		console.error('[CatchUp] could not read MessageStore:', error)
		return empty
	}

	if (!Array.isArray(messages) || !messages.length) return empty

	const usable = messages.filter(
		message =>
			message &&
			CONVERSATIONAL_TYPES.has(message.type ?? 0) &&
			(!skipBots || !message.author?.bot) &&
			renderContent(message),
	)

	// The tail, because catching up means the most recent messages, not the oldest loaded.
	const slice = usable.slice(-Math.max(1, limit))

	const lines = slice.map(message => ({
		author: authorLabel(message),
		content: renderContent(message),
	}))

	const text = lines.map(line => `${line.author}: ${line.content}`).join('\n')

	const userIds = new Set<string>()
	// An exec loop, not matchAll: not every Hermes build has matchAll.
	const mention = new RegExp(MENTION.source, 'g')
	for (let match = mention.exec(text); match; match = mention.exec(text))
		userIds.add(match[1])

	return {
		lines,
		available: usable.length,
		characters: text.length,
		text,
		userIds,
	}
}

/** The channel the command was run in, for the summary's header. */
export function channelLabel(channelId: string): string {
	try {
		const channel = (
			revenge.discord.flux.Stores as any
		)?.ChannelStore?.getChannel?.(channelId)
		if (!channel) return 'this channel'
		// 1 is a DM, 3 a group DM; neither has a name worth printing with a hash in front.
		if (channel.type === 1) return 'this DM'
		if (channel.type === 3) return channel.name || 'this group'
		return channel.name ? `#${channel.name}` : 'this channel'
	} catch {
		return 'this channel'
	}
}
