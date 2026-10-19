import assert from 'node:assert/strict'
import { test } from 'node:test'
import { liveEdit } from '../js/lib/liveReplace'
import { applyRules, keepCase, newRule } from '../js/lib/textReplace'

test('a plain rule follows the typed case when Match case is off', () => {
	const rules = [newRule({ find: 'omw', replace: 'on my way' })]
	assert.equal(applyRules('omw now', rules).text, 'on my way now')
	assert.equal(applyRules('Omw now', rules).text, 'On my way now')
	assert.equal(applyRules('OMW now', rules).text, 'ON MY WAY now')
	assert.equal(applyRules('oMw now', rules).text, 'on my way now')
})

test('a capitalised find still matches lower case typing', () => {
	const rules = [newRule({ find: 'Discord', replace: 'Dickcord' })]
	assert.equal(applyRules('i love discord', rules).text, 'i love Dickcord')
	assert.equal(applyRules('i love DISCORD', rules).text, 'i love DICKCORD')
})

test('Match case on keeps the old exact behaviour', () => {
	const rules = [newRule({ find: 'omw', replace: 'on my way', caseSensitive: true })]
	assert.equal(applyRules('Omw now', rules).text, 'Omw now')
	assert.equal(applyRules('omw now', rules).text, 'on my way now')
})

test('fragile replacements are never re-cased', () => {
	assert.equal(keepCase('LOL', '<:kekw:1234>'), '<:kekw:1234>')
	assert.equal(keepCase('Yt', 'https://youtube.com'), 'https://youtube.com')
	assert.equal(keepCase('IIRC', 'IIRC'), 'IIRC')
	assert.equal(keepCase('iirc', 'IIRC'), 'IIRC')
	assert.equal(keepCase('Ty', '¯\_(ツ)_/¯'), '¯\_(ツ)_/¯')
})

test('live replace follows the typed case too', () => {
	const textRules = [newRule({ find: 'omw', replace: 'on my way', live: true })]
	const text = 'Omw '
	const edit = liveEdit(text, text.length, { textRules })
	assert.ok(edit)
	assert.equal(text.slice(0, edit.location) + edit.text + text.slice(edit.location + edit.length), 'On my way ')
})
