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

import { Stores } from '@revenge-mod/discord/flux'
import { reportError } from '../../../../shared/report'

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
	 * Every user id behind a name in `text`, as an author or a mention. `lib/mentions.ts` turns
	 * those names back into mentions and drops any mention it did not get from here.
	 */
	userIds: Set<string>
	/** Name as written in `text` -> user id, one name per person. */
	people: Map<string, string>
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
 * People by name, not `<@id>`. Small models (AI Core Local's) can't copy an 18-digit id reliably
 * and summarise worse with numbers where names should be, and big ones don't need the ids either:
 * `lib/mentions.ts` turns the names back into tappable mentions afterwards. Each person gets one
 * name; a second person with the same display name gets their username added.
 */
class Names {
	readonly people = new Map<string, string>()
	private readonly byId = new Map<string, string>()

	nameOf(id: string, user?: any): string {
		const known = this.byId.get(id)
		if (known) return known
		const looked = user ?? lookupUser(id)
		const display = clean(looked?.globalName ?? looked?.global_name ?? looked?.username)
		if (!display) return 'someone'
		let name = display
		if (this.people.has(name) && looked?.username && looked.username !== display) name = `${display} (${looked.username})`
		for (let n = 2; this.people.has(name); n++) name = `${display} ${n}`
		this.people.set(name, id)
		this.byId.set(id, name)
		return name
	}
}

function lookupUser(id: string): any {
	try {
		return (Stores as any)?.UserStore?.getUser?.(id)
	} catch {
		return undefined
	}
}

/** One line, no colon (it would read as the end of the author), not blank. */
function clean(name: unknown): string {
	return typeof name === 'string' ? name.replace(/[\r\n:]+/g, ' ').trim() : ''
}

function authorLabel(message: any, names: Names): string {
	const author = message?.author
	if (typeof author?.id === 'string') return names.nameOf(author.id, author)
	return clean(message?.nick ?? author?.globalName ?? author?.global_name ?? author?.username) || 'someone'
}

/**
 * Attachments and embeds are named, not included. "[image]" tells the model a picture was part of
 * the conversation, which is occasionally load-bearing, without spending tokens on a CDN URL
 * nobody can read anyway. Mentions stay as `<@id>`, the same form author lines use.
 */
function renderContent(message: any, names?: Names): string {
	const parts: string[] = []
	const raw = typeof message?.content === 'string' ? message.content.trim() : ''
	const content = names ? raw.replace(MENTION, (_whole: string, id: string) => `@${names.nameOf(id)}`) : raw
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
		people: new Map(),
	}

	let messages: any[]
	try {
		const store = (Stores as any)?.MessageStore
		const result = store?.getMessages?.(channelId)
		// `getMessages` returns a collection wrapper, not an array, and its shape has moved
		// between builds. Take whichever of the two it is rather than assuming.
		messages =
			result?._array ??
			result?.toArray?.() ??
			(Array.isArray(result) ? result : [])
	} catch (error) {
		reportError('[CatchUp] could not read MessageStore:', error)
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

	const names = new Names()
	const lines = slice.map(message => ({
		author: authorLabel(message, names),
		content: renderContent(message, names),
	}))

	const text = lines.map(line => `${line.author}: ${line.content}`).join('\n')

	return {
		lines,
		available: usable.length,
		characters: text.length,
		text,
		userIds: new Set(names.people.values()),
		people: names.people,
	}
}

/** The channel the command was run in, for the summary's header. */
export function channelLabel(channelId: string): string {
	try {
		const channel = (
			Stores as any
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
