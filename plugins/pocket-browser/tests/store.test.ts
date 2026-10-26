import assert from 'node:assert/strict'
import { test } from 'node:test'
import { capturable, plainChatLink } from '../js/lib/format'
import { addVisit, toUrl } from '../js/lib/store'
import { historyRows, shortHost } from '../js/lib/format'

test('addresses load, everything else is searched', () => {
	assert.equal(toUrl('example.com'), 'https://example.com')
	assert.equal(toUrl('  en.wikipedia.org/wiki/Cat '), 'https://en.wikipedia.org/wiki/Cat')
	assert.equal(toUrl('example.com:8080/x'), 'https://example.com:8080/x')
	assert.equal(toUrl('localhost:3000'), 'http://localhost:3000')
	assert.equal(toUrl('192.168.1.1'), 'http://192.168.1.1')
	assert.equal(toUrl('https://a.b/c?d=1'), 'https://a.b/c?d=1')
	assert.equal(toUrl('about:blank'), 'about:blank')
	assert.equal(toUrl('cats and dogs'), 'https://duckduckgo.com/?q=cats%20and%20dogs')
	assert.equal(toUrl('cats', 'google'), 'https://www.google.com/search?q=cats')
	assert.equal(toUrl('node.js tips'), 'https://duckduckgo.com/?q=node.js%20tips')
	assert.equal(toUrl('v1.2'), 'https://duckduckgo.com/?q=v1.2')
	assert.equal(toUrl('   '), undefined)
})

test('history keeps one entry per address, newest first', () => {
	let history = addVisit([], 'https://a.com/', 'A', 1)
	history = addVisit(history, 'https://b.com/', '', 2)
	history = addVisit(history, 'https://a.com/', 'A again', 3)
	assert.deepEqual(history, [
		{ url: 'https://a.com/', title: 'A again', at: 3 },
		{ url: 'https://b.com/', title: 'https://b.com/', at: 2 },
	])
	const long = Array.from({ length: 600 }, (_, i) => ({ url: `https://x.com/${i}`, title: '', at: i }))
	assert.equal(addVisit(long, 'https://new.com/', 'n').length, 500)
})

test("web links are captured, Discord's own are not", () => {
	assert.ok(capturable('https://example.com/a'))
	assert.ok(capturable('http://user@example.com:8080/'))
	assert.ok(!capturable('https://discord.com/channels/1/2/3'))
	assert.ok(!capturable('https://discord.gg/abc'))
	assert.ok(!capturable('https://ptb.discord.com/x'))
	assert.ok(!capturable('https://cdn.discordapp.com/a.png'))
	assert.ok(capturable('https://notdiscord.com/'))
	assert.ok(!capturable('mailto:a@b.c'))
	assert.ok(!capturable(undefined))
})

test('short hosts for the address bar', () => {
	assert.equal(shortHost('https://www.example.com/a?b'), 'example.com')
	assert.equal(shortHost('http://user@host:80/x'), 'host')
	assert.equal(shortHost('about:blank'), 'about:blank')
})

test('chat taps: plain web links only, masked ones go through Discord', () => {
	const tap = (data: unknown) => ({ tapLinkData: { data } })
	const url = 'https://example.com/a'
	assert.equal(plainChatLink(tap({ url, node: { title: '', target: url, content: url } })), url)
	assert.equal(plainChatLink(tap({ url })), url)
	assert.equal(plainChatLink(tap({ url, node: { title: '', target: url, content: 'click me' } })), undefined)
	assert.equal(plainChatLink(tap({ action: 'bindUserMenu', userId: '1' })), undefined)
	assert.equal(plainChatLink(undefined), undefined)
})

test('History groups by day, newest first, and filters by title or address', () => {
	const now = Date.now()
	const day = 86_400_000
	const history = [
		{ url: 'https://a.example/1', title: 'Cats', at: now },
		{ url: 'https://b.example/2', title: 'Dogs', at: now - 1000 },
		{ url: 'https://c.example/3', title: 'Birds', at: now - 3 * day },
	]
	const rows = historyRows(history, '')
	assert.deepEqual(
		rows.map(row => (row.kind === 'day' ? `#${row.label}` : row.entry.title)),
		['#Today', 'Cats', 'Dogs', `#${rows[3].kind === 'day' ? rows[3].label : ''}`, 'Birds'],
	)
	assert.deepEqual(
		historyRows(history, 'B.EXAMPLE').map(row => (row.kind === 'day' ? 'day' : row.entry.title)),
		['day', 'Dogs'],
	)
	assert.equal(historyRows(history, 'nothing').length, 0)
})
