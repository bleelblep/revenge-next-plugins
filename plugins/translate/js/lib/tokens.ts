/**
 * Keeping Discord's markup out of the translator, and readable after it.
 *
 * A message's raw text is markdown: `<@123>` mentions, `<:name:id>` emoji, `||spoilers||`, code,
 * links, `<t:…>` timestamps. Sent as-is, a translation service mangles or translates them, and the
 * result is shown as plain text in the row -- so a spoiler came back uncovered, and a mention came
 * back as a raw `<@123…>` next to its own chip. Each token is swapped for a numbered placeholder
 * before the text leaves, and swapped back for something readable afterwards.
 *
 * Spoilers are never sent at all: their text is replaced by a placeholder and restored as a
 * blacked-out marker, never as the hidden words.
 */

/** Order matters: fenced code first, so a backtick inside a fence does not open inline code. */
const TOKEN =
	/```[\s\S]*?```|`[^`\n]+`|\|\|[\s\S]+?\|\||<a?:\w+:\d+>|<@!?\d+>|<@&\d+>|<#\d+>|<t:-?\d+(?::[tTdDfFR])?>|https?:\/\/[^\s<>]+/g

/** What a translation service leaves alone, and what survives one inserting spaces into it. */
const placeholder = (index: number) => `⟦${index}⟧`
const PLACEHOLDER = /⟦\s*(\d+)\s*⟧/g

const SPOILER_MARK = '▮▮▮'

function userName(id: string): string {
	try {
		const user = (revenge.discord.flux.Stores as any)?.UserStore?.getUser?.(id)
		return user?.globalName || user?.global_name || user?.username || 'user'
	} catch {
		return 'user'
	}
}

function channelName(id: string): string {
	try {
		return (revenge.discord.flux.Stores as any)?.ChannelStore?.getChannel?.(id)?.name || 'channel'
	} catch {
		return 'channel'
	}
}

/** The readable form of one token, as it should appear inside translated prose. */
function readable(token: string): string {
	if (token.startsWith('||')) return SPOILER_MARK

	let match = /^<a?:(\w+):\d+>$/.exec(token)
	if (match) return `:${match[1]}:`

	match = /^<@!?(\d+)>$/.exec(token)
	if (match) return `@${userName(match[1])}`

	if (/^<@&\d+>$/.test(token)) return '@role'

	match = /^<#(\d+)>$/.exec(token)
	if (match) return `#${channelName(match[1])}`

	match = /^<t:(-?\d+)/.exec(token)
	if (match) {
		const date = new Date(Number(match[1]) * 1000)
		return Number.isNaN(date.getTime()) ? token : date.toLocaleString()
	}

	// Code and links: shown exactly as written.
	return token
}

export interface Masked {
	/** The text to send, with every token replaced by a placeholder. */
	text: string
	/** Turns a translation of `text` back into readable prose. */
	restore(translated: string): string
}

export function mask(text: string): Masked {
	const tokens: string[] = []
	TOKEN.lastIndex = 0
	const masked = text.replace(TOKEN, token => {
		tokens.push(token)
		return placeholder(tokens.length - 1)
	})

	return {
		text: masked,
		restore(translated: string) {
			PLACEHOLDER.lastIndex = 0
			const restored = translated.replace(PLACEHOLDER, (whole, index) => {
				const token = tokens[Number(index)]
				return token === undefined ? whole : readable(token)
			})
			// A service that dropped a spoiler's placeholder entirely leaves nothing to reveal;
			// one that dropped a mention just loses the mention. Neither leaks anything.
			return restored
		},
	}
}
