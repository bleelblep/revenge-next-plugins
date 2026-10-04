import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importRules } from '../js/lib/importRules'
import { applyRules } from '../js/lib/textReplace'
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
