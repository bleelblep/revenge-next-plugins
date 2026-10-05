import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULTS } from '../js/defaults'
import { setStorage } from '../js/lib/state'
import { expandPlaceholders, withSendContext } from '../js/lib/greetings'
import { discordTimestamp, expandSnippets, formatLocal, scopeMatches } from '../js/lib/templateSyntax'
import { expandRandom } from '../js/lib/random'
import { validateTemplate } from '../js/lib/templateValidation'
import { applyRules, newRule } from '../js/lib/textReplace'

test('date formats, 24-hour time and timestamp offsets', () => {
	const date = new Date(2026, 9, 5, 14, 7, 9)
	assert.equal(formatLocal(date, 'dd/mm/yy', 'date'), '05/10/26')
	assert.equal(formatLocal(date, 'YYYY-MM-DD', 'date'), '2026-10-05')
	assert.equal(formatLocal(date, 'HH:mm:ss', 'time'), '14:07:09')
	assert.equal(formatLocal(date, 'hh:mm A', 'time'), '02:07 PM')
	assert.equal(formatLocal(date, 'invalid', 'time'), undefined)
	assert.equal(discordTimestamp(date, '+30m:R'), `<t:${Math.floor(date.getTime() / 1000) + 1800}:R>`)
	assert.equal(discordTimestamp(date, '-1d:F'), `<t:${Math.floor(date.getTime() / 1000) - 86400}:F>`)
	assert.equal(discordTimestamp(date, '+2x:R'), undefined)
})

test('sample context supports fallbacks and extra fields without Discord stores', () => {
	setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: true } } as any)
	try {
		const output = withSendContext({ now: new Date(2026, 9, 5, 14, 7), sample: { username: 'alex', name: '', created: '2020-01-01T00:00:00Z' } },
			() => expandPlaceholders('{greeting}, {name|friend}! {username} {joined:R|recently} {created:D} {date:dd/mm/yy} {time:HH:mm}'))
		assert.equal(output, 'Good afternoon, friend! alex recently <t:1577836800:D> 05/10/26 14:07')
	} finally { setStorage({ cache: { ...DEFAULTS } } as any) }
})

test('shuffle exhausts distinct choices and avoids repeats across bag boundaries', () => {
	const output = Array.from({ length: 30 }, () => expandRandom('$shuffle{Hai, Hey, Hello}', 'shuffle-test'))
	for (let i = 0; i < output.length; i += 3) assert.equal(new Set(output.slice(i, i + 3)).size, 3)
	for (let i = 1; i < output.length; i++) assert.notEqual(output[i], output[i - 1])
})

test('snippets expand recursively with visible cycle and missing references', () => {
	const snippets = [{ name: 'hello', text: 'Hi {name|friend}' }, { name: 'outer', text: '{snippet:hello}!' }, { name: 'loop', text: '{snippet:loop}' }]
	assert.equal(expandSnippets('{snippet:outer}', snippets), 'Hi {name|friend}!')
	assert.equal(expandSnippets('{snippet:loop}', snippets), '{snippet:loop}')
	assert.equal(expandSnippets('{snippet:missing}', snippets), '{snippet:missing}')
	assert.equal(expandSnippets('x'.repeat(65000), []).length, 65000)
	assert.ok(validateTemplate('{snippet:loop}', '', snippets).some(warning => warning.includes('cyclic')))
})

test('scopes distinguish guilds, channels, DMs and unavailable context', () => {
	assert.equal(scopeMatches({ kind: 'servers', ids: ['g'] }, 'c', 'g', 0), true)
	assert.equal(scopeMatches({ kind: 'channels', ids: ['c'] }, 'other', 'g', 0), false)
	assert.equal(scopeMatches({ kind: 'dms' }, 'c', undefined, 1), true)
	assert.equal(scopeMatches({ kind: 'dms' }), false)
	assert.equal(scopeMatches({ kind: 'channels', ids: [] }, 'c'), false)
	setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: false } } as any)
	const rule = newRule({ find: 'hi', replace: 'hello', scope: { kind: 'channels', ids: ['c'] } })
	assert.equal(applyRules('hi', [rule]).text, 'hi')
})

test('validation warns about malformed syntax and oversized output', () => {
	assert.ok(validateTemplate('{timestamp:+2x:R}', '').some(w => w.includes('timestamp')))
	assert.ok(validateTemplate('{unknown}', '').some(w => w.includes('Unknown')))
	assert.ok(validateTemplate('`hello', '`hello').some(w => w.includes('backtick')))
	assert.ok(validateTemplate('', 'a'.repeat(2001)).some(w => w.includes('2001')))
})
