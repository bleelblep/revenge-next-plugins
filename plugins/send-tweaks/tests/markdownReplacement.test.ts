import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULTS } from '../js/defaults'
import { setStorage } from '../js/lib/state'
import { newRule } from '../js/lib/textReplace'
import { transform } from '../js/lib/transform'
import { cleanText, mapUrls } from '../js/lib/cleanUrls'

function configure() {
	setStorage({ cache: {
		...DEFAULTS,
		clearUrlsRules: false,
		textReplace: true,
		rules: [newRule({ find: 'Welc', replace: '**Welcome!**\n[Help](https://example.com/help)' })],
	} } as any)
}

test('replacements accept markdown input and produce multiline markdown', () => {
	configure()
	for (const [input, expected] of [
		['Welc', '**Welcome!**\n[Help](https://example.com/help)'],
		['**Welc**', '****Welcome!**\n[Help](https://example.com/help)**'],
		['> Welc', '> **Welcome!**\n[Help](https://example.com/help)'],
		['# Welc', '# **Welcome!**\n[Help](https://example.com/help)'],
		['||Welc||', '||**Welcome!**\n[Help](https://example.com/help)||'],
	]) assert.equal(transform(input).text, expected)
})

test('code stays literal while prose replacements still run', () => {
	configure()
	assert.equal(transform('`Welc` Welc').text, '`Welc` **Welcome!**\n[Help](https://example.com/help)')
})

test('cleaning tracking inside formatting preserves the closing markdown', () => {
	configure()
	for (const marker of ['**', '*', '__', '_', '~~', '||']) {
		assert.equal(
			transform(`${marker}https://example.com/?utm_source=test${marker}`).text,
			`${marker}https://example.com/${marker}`,
		)
	}
})

test('a markdown link does not swallow adjacent replaceable prose', () => {
	configure()
	assert.equal(transform('[Help](https://example.com/)Welc').text,
		'[Help](https://example.com/)**Welcome!**\n[Help](https://example.com/help)')
})

test('URL punctuation and path characters remain intact', () => {
	configure()
	for (const [input, expected] of [
		['https://example.com/a_(b)?utm_source=test', 'https://example.com/a_(b)'],
		['(https://example.com/a_(b)?utm_source=test).', '(https://example.com/a_(b)).'],
		['https://example.com/a_?q=value_&utm_source=test', 'https://example.com/a_?q=value_'],
		['_https://example.com/a_b?utm_source=test_.', '_https://example.com/a_b_.'],
		['[help](https://example.com/a_(b)?utm_source=test)', '[help](https://example.com/a_(b))'],
	]) assert.equal(cleanText(input).text, expected)
	const seen: string[] = []
	mapUrls('[help](https://example.com/a_(b))Welc', url => { seen.push(url); return url })
	assert.deepEqual(seen, ['https://example.com/a_(b)'])
})
