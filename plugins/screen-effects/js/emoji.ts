import type { CustomItem } from "./native"
import { Stores } from "@revenge-mod/discord/flux"
import * as finders from "@revenge-mod/modules/finders"
import * as filters from "@revenge-mod/modules/finders/filters"
import { reportError } from "../../../shared/report"

/** Discord serves any custom emoji at this address; animated ones come back as their first frame. */
const emojiUrl = (id: string) => `https://cdn.discordapp.com/emojis/${id}.png?size=96`

/** `<:name:id>` / `<a:name:id>` markup, a `:shortcode:`, or an image link. */
const TOKEN = /<a?:[\w~]+:(\d+)>|:([\w~+-]+):|(https?:\/\/\S+)/g

export interface ParsedCustom {
	items: CustomItem[]
	/** Shortcodes that matched neither a standard emoji nor one of your servers' emoji. */
	missing: string[]
	serverEmoji: number
	links: number
}

function stores(): any {
	return Stores as any
}

let unicodeModule: any

/** Discord's shortcode table (`convertNameToSurrogate("fire")` -> "🔥"). Looked up once. */
function unicodeEmoji(name: string): string | undefined {
	try {
		if (unicodeModule === undefined) {
			const { lookupModule } = finders
			const { withProps } = filters
			const [mod] = lookupModule(withProps("convertNameToSurrogate")) as [any, number | undefined]
			// The export is usually on `default`, not the namespace -- porting rule 3.
			unicodeModule =
				typeof mod?.convertNameToSurrogate === "function" ? mod : (mod?.default ?? null)
		}
		const surrogate = unicodeModule?.convertNameToSurrogate?.(name)
		return typeof surrogate === "string" && surrogate ? surrogate : undefined
	} catch (error) {
		reportError("[ScreenEffects] shortcode lookup failed:", error)
		unicodeModule = null
		return undefined
	}
}

/** A server emoji by name, from every server you're in. Exact case wins over a loose match. */
function serverEmoji(name: string): string | undefined {
	try {
		const s = stores()
		const guilds = s.GuildStore?.getGuilds?.() ?? {}
		const lower = name.toLowerCase()
		let loose: string | undefined
		for (const guildId of Object.keys(guilds)) {
			for (const emoji of s.EmojiStore?.getGuildEmoji?.(guildId) ?? []) {
				if (emoji?.name === name) return emoji.id
				if (!loose && emoji?.name?.toLowerCase() === lower) loose = emoji.id
			}
		}
		return loose
	} catch (error) {
		reportError("[ScreenEffects] server emoji lookup failed:", error)
		return undefined
	}
}

/**
 * Turns what the user typed into things native can draw. Plain emoji pass through as text;
 * `:name:` becomes a standard emoji if there is one, otherwise one of your servers' emoji;
 * pasted emoji markup and image links become images.
 */
export function parseCustom(input: string): ParsedCustom {
	const out: ParsedCustom = { items: [], missing: [], serverEmoji: 0, links: 0 }
	const text = (value: string) => {
		if (value.trim()) out.items.push({ type: "text", value })
	}

	let last = 0
	for (const match of input.matchAll(TOKEN)) {
		text(input.slice(last, match.index))
		last = (match.index ?? 0) + match[0].length
		const [whole, markupId, shortcode, link] = match

		if (markupId) {
			out.items.push({ type: "image", url: emojiUrl(markupId) })
			out.serverEmoji++
		} else if (shortcode) {
			const unicode = unicodeEmoji(shortcode)
			const id = unicode ? undefined : serverEmoji(shortcode)
			if (unicode) text(unicode)
			else if (id) {
				out.items.push({ type: "image", url: emojiUrl(id) })
				out.serverEmoji++
			} else out.missing.push(whole)
		} else if (link) {
			out.items.push({ type: "image", url: link })
			out.links++
		}
	}
	text(input.slice(last))
	return out
}
