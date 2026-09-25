/**
 * Reading rules shared as text, in the format of Fiery's Text Replace plugin for Vendetta/Bunny:
 *
 * ```json
 * { "name": "Twitter to fxtwitter", "match": "https?:\\/\\/twitter\\.com(?=\\/\\w+?\\/status\\/)",
 *   "flags": "g", "replace": "https://fxtwitter.com", "regex": true }
 * ```
 *
 * That plugin's users shared rules in Discord as JSON, often in ```json code blocks, so what gets
 * pasted here is anything from one bare object to a whole message of text with several blocks in it.
 * Every JSON object or array found is tried; anything that is not a rule is reported, not guessed at.
 *
 * Mapping: `match` -> `find`, `flags` `i` -> not case-sensitive, `m`/`s`/`u` kept as `extraFlags`.
 * Text Replace had no whole-word option, so imported rules have it off -- matching what they did there.
 */

import { compileRule, newRule, sanitizeFlags, type Rule } from './textReplace'

export interface ImportResult {
	rules: Rule[]
	/** One line per thing that was not imported, and why. */
	skipped: string[]
}

/** Pulls every top-level JSON object or array out of free text: code blocks, chat, or bare JSON. */
function jsonChunks(text: string): string[] {
	const chunks: string[] = []
	let depth = 0
	let start = -1
	let inString = false
	let escaped = false
	for (let i = 0; i < text.length; i++) {
		const char = text[i]
		if (inString) {
			if (escaped) escaped = false
			else if (char === '\\') escaped = true
			else if (char === '"') inString = false
			continue
		}
		if (char === '"' && depth > 0) inString = true
		else if (char === '{' || char === '[') {
			if (depth === 0) start = i
			depth++
		} else if ((char === '}' || char === ']') && depth > 0) {
			depth--
			if (depth === 0 && start >= 0) {
				chunks.push(text.slice(start, i + 1))
				start = -1
			}
		}
	}
	return chunks
}

function toRule(raw: any, label: string): Rule | string {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return `${label}: not a rule`
	const find = typeof raw.match === 'string' ? raw.match : typeof raw.find === 'string' ? raw.find : ''
	if (!find) return `${label}: has no "match"`
	if (typeof raw.replace !== 'string') return `${label}: has no "replace"`

	const flags = typeof raw.flags === 'string' ? raw.flags : 'g'
	const rule = newRule({
		name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : undefined,
		find,
		replace: raw.replace,
		regex: raw.regex === true,
		caseSensitive: !flags.includes('i'),
		wholeWord: false,
		extraFlags: sanitizeFlags(flags) || undefined,
	})
	const compiled = compileRule(rule)
	if (compiled.error) return `${rule.name ?? label}: ${compiled.error}`
	return rule
}

export function importRules(text: string): ImportResult {
	const rules: Rule[] = []
	const skipped: string[] = []
	const chunks = jsonChunks(text)
	if (!chunks.length) return { rules, skipped: ['No rule found. Paste the JSON, braces included.'] }

	let index = 0
	for (const [block, chunk] of chunks.entries()) {
		let parsed: unknown
		try {
			parsed = JSON.parse(chunk)
		} catch {
			skipped.push(`Block ${block + 1}: not valid JSON`)
			continue
		}
		for (const raw of Array.isArray(parsed) ? parsed : [parsed]) {
			index++
			const result = toRule(raw, `Rule ${index}`)
			if (typeof result === 'string') skipped.push(result)
			else rules.push(result)
		}
	}
	return { rules, skipped }
}

/** The same format back out, so a rule made here can be shared with Text Replace users. */
export function exportRule(rule: Rule): string {
	return JSON.stringify(
		{
			name: rule.name ?? rule.find,
			match: rule.find,
			flags: `g${rule.caseSensitive ? '' : 'i'}${sanitizeFlags(rule.extraFlags)}`,
			replace: rule.replace,
			regex: rule.regex,
		},
		null,
		4,
	)
}

/** The Vendetta server thread where Text Replace users share rules. The ready-made rules come from it. */
export const THREAD = {
	guildId: '1015931589865246730',
	channelId: '1094345290405920829',
	url: 'https://discord.com/channels/1015931589865246730/1094345290405920829',
}

export interface Preset {
	/** Which list it belongs in. */
	kind: 'links' | 'text'
	/**
	 * `thread`: as posted there. `updated`: from there, changed because the original no longer works
	 * or misses common links (the note says how). `added`: not from the thread.
	 */
	source: 'thread' | 'updated' | 'added'
	note: string
	rule: Omit<Rule, 'id' | 'enabled'>
}

/**
 * Checked on 2026-09-26 against the live services, requesting each with Discord's link-preview
 * user agent. Left out as dead: ddinstagram.com (no DNS), clips.txitch.tv (no DNS), vxtiktok.com
 * (shut down after a legal request), rxyddit.com (403; its domain now points at a personal site).
 * Changed: the thread's vxtwitter rule ends in `(?:(?:\?|&)(?:s|t)=\w+)*`, a repeat inside a repeat
 * that the freeze guard refuses; the tracking cleaner already removes ?s= and ?t=, so it was dropped.
 * Left out as not working: youtu.be to youtube.com (a link with ?t= becomes "watch?v=ID?t=42"),
 * http-ify (turns "Node.js" and "README.md" into links), Discord proxy to CDN (misses file names
 * with a dash). Left out as a personal preference: the heart replacer.
 */
export const PRESETS: Preset[] = [
	{
		kind: 'links',
		source: 'updated',
		note: 'Also catches www. and mobile. links. Pick this or vxtwitter, not both.',
		rule: {
			name: 'Twitter to fxtwitter',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?twitter\.com(?=\/\w+?\/status\/)`,
			replace: 'https://fxtwitter.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'Another embed fixer for the same links; pick this or fxtwitter, not both. The original also stripped ?s= and ?t=, which Send Tweaks already removes.',
		rule: {
			name: 'Twitter to vxtwitter',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?twitter\.com(?=\/\w+?\/status\/)`,
			replace: 'https://vxtwitter.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'added',
		note: 'Not from the thread, which predates x.com links. Same service as fxtwitter.',
		rule: {
			name: 'X to fixupx',
			find: String.raw`https?:\/\/(?:www\.|mobile\.)?x\.com(?=\/\w+?\/status\/)`,
			replace: 'https://fixupx.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'The thread used rxyddit.com, which has shut down. vxreddit.com embeds posts properly.',
		rule: {
			name: 'Reddit to vxreddit',
			find: String.raw`https?:\/\/(?:www\.|old\.|new\.)?reddit\.com(?=\/r\/\w+?\/comments\/)`,
			replace: 'https://vxreddit.com',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'updated',
		note: 'Also catches links without www. and usernames with dots or underscores, which the original missed.',
		rule: {
			name: 'TikTok to tiktxk',
			find: String.raw`https?:\/\/(?:(?:www\.|m\.)?tiktok\.com\/(@[\w.-]+\/video\/\d+|t\/\w+)|vm\.tiktok\.com\/(\w+))`,
			replace: 'https://tiktxk.com/$1$2',
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'links',
		source: 'thread',
		note: 'Opens Shorts in the normal YouTube player.',
		rule: {
			name: 'YouTube Shorts to watch',
			find: 'youtube.com/shorts/',
			replace: 'youtube.com/watch?v=',
			regex: true,
			caseSensitive: true,
			wholeWord: false,
		},
	},
	{
		kind: 'text',
		source: 'thread',
		note: 'Anywhere in a message, not only at the start like Discord’s own /shrug.',
		rule: {
			name: '/shrug',
			find: '/shrug',
			replace: String.raw`¯\_(ツ)_/¯`,
			regex: false,
			caseSensitive: false,
			wholeWord: false,
		},
	},
	{
		kind: 'text',
		source: 'thread',
		note: 'Escapes every markdown character in every message while it is on — switch it off to format again.',
		rule: {
			name: "Disable Discord's message markdown",
			find: '([`"*_<>~|#.-])',
			replace: String.raw`\$1`,
			regex: true,
			caseSensitive: false,
			wholeWord: false,
		},
	},
]
