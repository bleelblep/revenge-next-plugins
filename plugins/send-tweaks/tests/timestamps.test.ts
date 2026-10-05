import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULTS } from '../js/defaults'
import { setStorage } from '../js/lib/state'
import { applyRules, newRule } from '../js/lib/textReplace'

test('Discord timestamps are gated, support every style, and use seconds consistently', () => {
	const replacement = '{timestamp} ' + [...'tTdDfFR'].map(style => `{timestamp:${style}}`).join(' ')
	for (const regex of [false, true]) {
		const rule = newRule({ find: 'when', replace: replacement, regex })
		setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: false } } as any)
		assert.equal(applyRules('when', [rule]).text, replacement)
		setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: true } } as any)
		const before = Math.floor(Date.now() / 1000)
		const result = applyRules('when', [rule]).text
		const matches = [...result.matchAll(/<t:(\d+):([tTdDfFR])>/g)]
		assert.equal(matches.length, 8)
		assert.equal(matches.map(m => m[2]).join(''), 'ftTdDfFR')
		assert.equal(new Set(matches.map(m => m[1])).size, 1)
		assert.ok(Number(matches[0][1]) >= before && Number(matches[0][1]) <= Math.floor(Date.now() / 1000))
	}
	setStorage({ cache: { ...DEFAULTS } } as any)
})

test('timestamp choices work within random and unknown formats remain literal', () => {
	setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: true } } as any)
	try {
		const rule = newRule({ find: 'when', replace: '$random{{timestamp:R}} {timestamp:X}' })
		assert.match(applyRules('when', [rule]).text, /^<t:\d+:R> \{timestamp:X\}$/)
	} finally { setStorage({ cache: { ...DEFAULTS } } as any) }
})
