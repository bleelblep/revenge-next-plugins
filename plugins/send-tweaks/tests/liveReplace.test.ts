import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveEdit } from '../js/lib/liveReplace'
import { newRule, type Rule } from '../js/lib/textReplace'

/** Applies the edit liveEdit returns, as replaceRange would. */
function type(text: string, rules: { textRules?: Rule[]; linkRules?: Rule[] }, cursor = text.length): string {
	const edit = liveEdit(text, cursor, rules)
	if (!edit) return text
	return text.slice(0, edit.location) + edit.text + text.slice(edit.location + edit.length)
}

const word = (find: string, replace: string, extra: Partial<Rule> = {}) => newRule({ find, replace, live: true, ...extra })

test('replaces the word just finished, once a space is typed', () => {
	const rules = { textRules: [word('teh', 'the')] }
	assert.equal(type('teh cat ', rules), 'teh cat ')
	assert.equal(type('teh ', rules), 'the ')
	assert.equal(type('teh', rules), 'teh')
	assert.equal(type('teh\n', rules), 'the\n')
	// Typing a second space does not run it again.
	assert.equal(liveEdit('teh  ', 5, rules), undefined)
})

test('only touches the end, even when earlier text matches', () => {
	const rules = { textRules: [word('teh', 'the')] }
	assert.equal(type('teh dog teh ', rules), 'teh dog the ')
	// Caret mid-text: the word before the caret, nothing after it.
	assert.equal(type('teh and teh', rules, 4), 'the and teh')
})

test('rules spanning words fire when the last word is finished', () => {
	const rules = { textRules: [word('by the way', 'btw')] }
	assert.equal(type('oh by the way ', rules), 'oh btw ')
})

test('rules build on each other, in order', () => {
	const rules = { textRules: [word('teh', 'the'), word('the', 'THE')] }
	assert.equal(type('teh ', rules), 'THE ')
})

test('a result that would change again on send is left for send', () => {
	const rules = { textRules: [word('lol', 'lol 😂')] }
	assert.equal(type('lol ', rules), 'lol ')
})

test('placeholders and anchors wait for send', () => {
	assert.equal(type('hi ', { textRules: [word('hi', 'hi {name}')] }), 'hi ')
	assert.equal(type('hi ', { textRules: [word('hi$', 'yo', { regex: true })] }), 'hi ')
	assert.equal(type('hi ', { textRules: [word('[^$]hi', 'yo', { regex: true })] }), 'hi ')
})

test('regex replacements expand groups', () => {
	const rules = { textRules: [word('(\\w+)ing\\b', '$1in\'', { regex: true })] }
	assert.equal(type('going ', rules), "goin' ")
	assert.equal(type('costs 5usd ', { textRules: [word('(\\d+)usd', '$$$1', { regex: true })] }), 'costs $5 ')
	assert.equal(type('5km ', { textRules: [word('(?<n>\\d+)km', '$<n> km', { regex: true })] }), '5 km ')
})

test('regex rules trigger immediately without waiting for space', () => {
	const rules = { textRules: [word('(\\d+)deg', '$1°', { regex: true })] }
	assert.equal(type('45deg', rules), '45°')
	assert.equal(type('temp 100deg', rules), 'temp 100°')
	// Plain text rules still require a space
	const plainRules = { textRules: [word('45deg', '45°', { regex: false })] }
	assert.equal(type('45deg', plainRules), '45deg')
	assert.equal(type('45deg ', plainRules), '45° ')
})

test('code, mentions and disabled rules are left alone', () => {
	const rules = { textRules: [word('teh', 'the')] }
	assert.equal(type('`teh ', rules), '`teh ')
	assert.equal(type('```\nteh ', rules), '```\nteh ')
	assert.equal(type('`x` teh ', rules), '`x` the ')
	assert.equal(type('<@123> ', { textRules: [word('123', 'x', { wholeWord: false })] }), '<@123> ')
	assert.equal(type('teh ', { textRules: [word('teh', 'the', { enabled: false })] }), 'teh ')
	assert.equal(type('teh ', { textRules: [word('teh', 'the', { live: false })] }), 'teh ')
})

test('link rules rewrite a finished link and keep its punctuation', () => {
	const rules = {
		linkRules: [word('(https?://)(?:www\\.)?twitter\\.com', '$1fxtwitter.com', { regex: true })],
		textRules: [word('twitter', 'X')],
	}
	assert.equal(type('see https://twitter.com/a/status/1 ', rules), 'see https://fxtwitter.com/a/status/1 ')
	assert.equal(type('(https://twitter.com/a) ', rules), '(https://fxtwitter.com/a) ')
	// Text rules never reach into a link.
	assert.equal(type('https://twitter.com/a ', { textRules: rules.textRules }), 'https://twitter.com/a ')
})

test('the edit is the smallest change', () => {
	assert.deepEqual(liveEdit('hello teh ', 10, { textRules: [word('teh', 'the')] }), {
		location: 7,
		length: 2,
		text: 'he',
	})
})
