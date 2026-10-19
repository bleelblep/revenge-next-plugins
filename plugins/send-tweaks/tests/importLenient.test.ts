import assert from 'node:assert/strict'
import { test } from 'node:test'
import { importRules } from '../js/lib/importRules'
import { applyRules } from '../js/lib/textReplace'

test('imports capitalised keys and single-backslash regexes', () => {
	// Exactly as it was pasted: `\.` isn't valid JSON, and the keys are capitalised.
	const pasted = String.raw`{
"Name": "TikTok to tnktok",
"Match": "^https?://(?:vm|vt)\.tiktok\.com/([^/]+?)/?$",
"Flags": "gi",
"Replace": "https://vt.tnktok.com/$1",
"Regex": true,
"wholeWord": false
}`
	const { rules, skipped } = importRules(pasted)
	assert.deepEqual(skipped, [])
	assert.equal(rules.length, 1)
	assert.equal(rules[0].name, 'TikTok to tnktok')
	assert.equal(rules[0].regex, true)
	assert.equal(rules[0].caseSensitive, false)
	assert.equal(rules[0].find, String.raw`^https?://(?:vm|vt)\.tiktok\.com/([^/]+?)/?$`)
	assert.equal(applyRules('https://vt.tiktok.com/ZMabc/', rules).text, 'https://vt.tnktok.com/ZMabc')
})

test('properly escaped JSON is unchanged', () => {
	const { rules } = importRules(String.raw`{"match": "a\\.b\\\\c", "replace": "x\ny\t\"q\"", "regex": true}`)
	assert.equal(rules[0].find, String.raw`a\.b\\c`)
	assert.equal(rules[0].replace, 'x\ny\t"q"')
})
