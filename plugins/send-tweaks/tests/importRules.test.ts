import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importRules } from '../js/lib/importRules'
import { applyRules, newRule } from '../js/lib/textReplace'
import { DEFAULTS } from '../js/defaults'
import { setStorage } from '../js/lib/state'
import { transform } from '../js/lib/transform'
import { withSendContext } from '../js/lib/greetings'

const greeting = {
	name: 'greet',
	match: 'Welc',
	flags: 'gi',
	replace: "{greeting}, {mention}! Welcome in! 👋\nI'm {me}, and I'm happy to have you here. It's {time} on {date}.\nIf you need any help, feel free to ask in https://discord.com/channels/1205207689832038522/1296197038006075543.\nTake a look around and make yourself at home, {name}!",
	regex: true,
}

test('distinguishes empty input, replacement-only text, and truncated JSON', () => {
	assert.match(importRules(' ').skipped[0], /empty/)
	assert.match(importRules('Welcome to the server').skipped[0], /No JSON object/)
	assert.match(importRules('{"name":"greet","match":"Welc"').skipped[0], /incomplete JSON/)
	assert.match(importRules('{"replace":"unfinished').skipped[0], /incomplete JSON/)
	const mixed = importRules(JSON.stringify(greeting) + '\n{"name":"unfinished"')
	assert.equal(mixed.rules.length, 1)
	assert.equal(mixed.skipped.length, 1)
	assert.match(mixed.skipped[0], /Block 2/)
})

test('imports the supplied greeting JSON and replaces the trigger case-insensitively', () => {
	setStorage({ cache: { ...DEFAULTS } } as any)
	const result = importRules(JSON.stringify(greeting))
	assert.deepEqual(result.skipped, [])
	assert.equal(result.rules.length, 1)
	assert.equal(result.rules[0].enabled, true)
	assert.equal(result.rules[0].caseSensitive, false)
	assert.equal(result.rules[0].regex, true)
	// Greeting expansion is deliberately locked by default; importing alone does not unlock it.
	assert.deepEqual(applyRules('wElC', result.rules), { text: greeting.replace, applied: 1 })
})

const reported = [
	{
		name: 'innext', match: 'Innext', flags: 'gi', regex: false,
		replace: "{greeting}, {mention}! Here's how to install Revenge Next:\n\n1. Copy this URL (tap it to copy): `https://i.allyapp.cc/go/REdrBZ Open **Settings** and go to the **Revenge** section\n3. Tap **Revenge**, scroll down, and enable **Developer Options**\n4. Go back to the Revenge section and open **Developers**\n5. Enable **Load from Custom URL**\n6. In the URL field, remove the existing`http://localhost:4040/` value and paste the copied URL\n7. Tap **Clear JS Bundle**, then **reload Revenge**\n8. Open **Revenge Manager**, go to **Settings > Customize**, and change the update channel from **Stable** to **Alpha**\n9. **Update Revenge** through the manager\n10. Once the update finishes, you're all set to use Next!",
	},
	{
		name: 'plugins', match: 'Inplug', flags: 'gi', regex: false,
		replace: '{greeting}, {mention}! Here\'s how to install a plugin:\n\n1. Go to #plugins and find the one you want (check the pins to jump to the top)\n2. Press and hold the "Install" link, then tap **Copy Link**\n3. Open **User Settings**\n4. Scroll to the **Revenge** category and tap **Plugins**\n5. Tap the **+** button, paste the link, and tap **Install**\n\nYou can also browse plugins from these 2 sources (same system, one is a website and one is a plugin):\n**Website:** <https://i.allyapp.cc/go/zgieN5>\n**Plugin:** https://i.allyapp.cc/go/c5UjF3',
	},
	greeting,
]

test('all three reported rules import together and survive the full transform with markdown intact', () => {
	const imported = importRules(reported.map(rule => JSON.stringify(rule)).join('\n'))
	assert.deepEqual(imported.skipped, [])
	assert.equal(imported.rules.length, 3)
	setStorage({ cache: { ...DEFAULTS, clearUrlsRules: false, textReplace: true, rules: imported.rules } } as any)
	for (const rule of reported) {
		const result = transform(rule.match.toLowerCase())
		assert.equal(result.text, rule.replace)
		assert.equal(result.replaced, 1)
	}
})

test('reported replacements expand greeting fields without damaging their markdown', () => {
	const globals = globalThis as any
	const previous = globals.revenge
	const imported = importRules(JSON.stringify(reported))
	globals.revenge = { discord: { flux: { Stores: {
		ChannelStore: { getChannel: () => ({ guild_id: 'guild' }) },
		GuildMemberStore: { getNick: () => undefined },
		UserStore: { getCurrentUser: () => ({ id: 'self', username: 'Helper' }) },
		MessageStore: { getMessage: () => ({ author: { id: '123456789012345678', username: 'Newcomer' } }) },
	} } } }
	setStorage({ cache: { ...DEFAULTS, clearUrlsRules: false, textReplace: true,
		greetingsUnlocked: true, rules: imported.rules } } as any)
	try {
		for (const rule of reported) {
			const result = withSendContext({ channelId: 'channel', replyToId: 'reply' }, () => transform(rule.match))
			assert.equal(result.replaced, 1)
			assert.match(result.text, /^Good (morning|afternoon|evening), <@123456789012345678>! /)
			assert.doesNotMatch(result.text, /\{(?:greeting|mention|me|time|date|name)\}/)
			// All instructions after the greeting remain byte-for-byte, including the malformed backticks.
			if (rule !== greeting) assert.equal(result.text.slice(result.text.indexOf('! ') + 2), rule.replace.slice(rule.replace.indexOf('! ') + 2))
			else assert.match(result.text, /I'm Helper,.*make yourself at home, Newcomer!/s)
		}
	} finally {
		globals.revenge = previous
		setStorage({ cache: { ...DEFAULTS } } as any)
	}
})

test('imports many rules from an array or separate JSON blocks', () => {
	const rules = Array.from({ length: 50 }, (_, i) => ({
		name: `Rule ${i}`,
		match: `^trigger${i}$`,
		flags: 'gi',
		replace: `Replacement ${i}\nSecond line`,
		regex: true,
	}))
	for (const text of [JSON.stringify(rules), rules.map(rule => `\`\`\`json\n${JSON.stringify(rule)}\n\`\`\``).join('\n')]) {
		const result = importRules(text)
		assert.deepEqual(result.skipped, [])
		assert.equal(result.rules.length, 50)
		assert.deepEqual(applyRules('TRIGGER42', result.rules), {
			text: 'Replacement 42\nSecond line',
			applied: 1,
		})
	}
})

test('expands {timestamp} placeholder into Discord timestamp tag <t:unix:F> and supports format styles', () => {
	setStorage({ cache: { ...DEFAULTS } } as any)
	const rules = [
		newRule({ find: '!now', replace: 'Current time: {timestamp}' }),
		newRule({ find: '!rel', replace: 'Ago: {timestamp:R}' }),
		newRule({ find: '!time', replace: 'Short: {timestamp:t}' }),
	]
	const res1 = applyRules('!now', rules)
	assert.match(res1.text, /^Current time: <t:\d+:F>$/)
	assert.equal(res1.applied, 1)

	const res2 = applyRules('!rel', rules)
	assert.match(res2.text, /^Ago: <t:\d+:R>$/)
	assert.equal(res2.applied, 1)

	const res3 = applyRules('!time', rules)
	assert.match(res3.text, /^Short: <t:\d+:t>$/)
	assert.equal(res3.applied, 1)
})

test('applies rainbow ANSI formatting to infinite characters via {rainbow:$1} and {rainbow}', () => {
	const rainbowRule = newRule({
		name: '/rainbow',
		find: '^/rainbow\\s+([\\s\\S]+)$',
		replace: '{rainbow:$1}',
		regex: true,
	})
	const longText = 'A'.repeat(500)
	const res = applyRules(`/rainbow ${longText}`, [rainbowRule])
	assert.equal(res.applied, 1)
	assert.ok(res.text.startsWith('```ansi\n'))
	assert.ok(res.text.endsWith('\u001b[0m\n```'))
	// Verify it contains valid Discord ANSI color escapes (0;31m normal, not invalid 2;31m dim)
	assert.ok(res.text.includes('\u001b[0;31mA'))
	assert.ok(res.text.includes('\u001b[0;33mA'))
	assert.ok(res.text.includes('\u001b[0;32mA'))

	// Also test shorthand {rainbow}
	const shorthandRule = newRule({
		name: '/rainbow-short',
		find: '^/rainbow\\s+([\\s\\S]+)$',
		replace: '{rainbow}',
		regex: true,
	})
	const shortRes = applyRules('/rainbow Hello world', [shorthandRule])
	assert.equal(shortRes.applied, 1)
	assert.ok(shortRes.text.startsWith('```ansi\n'))
	assert.ok(shortRes.text.includes('\u001b[0;31mH'))
})

test('auto-converts legacy or invalid format 2; ANSI codes to Discord-compliant 0; format codes', () => {
	const legacyRule = newRule({
		name: 'legacy',
		find: '^hi$',
		replace: '```ansi\n\\u001b[2;31mh\\u001b[2;33mi\\u001b[0m\n```',
		regex: true,
	})
	const res = applyRules('hi', [legacyRule])
	assert.equal(res.applied, 1)
	assert.ok(res.text.includes('\u001b[0;31mh\u001b[0;33mi\u001b[0m'))
	assert.ok(!res.text.includes('[2;31m'))
})

test('imports JSON with unescaped literal newlines in strings without failing', () => {
	const raw = '{\n  "name": "multiline",\n  "match": "hello\\nworld",\n  "replace": "multiline\nreplacement",\n  "regex": false\n}'
	const res = importRules(raw)
	assert.equal(res.rules.length, 1)
	assert.equal(res.rules[0].name, 'multiline')
	assert.equal(res.rules[0].replace, 'multiline\nreplacement')
})

test('formats ```ansi codeblocks in outgoing messages to valid Discord ANSI', () => {
	setStorage({ cache: { ...DEFAULTS } } as any)
	const raw = '```ansi\n\\u001b[0;30mBlack\\u001b[0;0m\n\\u001b[0;31mRed\\u001b[0;0m\n```'
	const res = transform(raw)
	assert.ok(res.text.includes('\u001b[0;30mBlack\u001b[0m'))
	assert.ok(res.text.includes('\u001b[0;31mRed\u001b[0m'))
	assert.ok(!res.text.includes('\\u001b'))
	assert.ok(!res.text.includes('[0;0m'))

	// Test missing ESC byte
	const missingEsc = '```ansi\n[36mHello Discord\n```'
	const res2 = transform(missingEsc)
	assert.ok(res2.text.includes('\u001b[0;36mHello Discord'))
})

