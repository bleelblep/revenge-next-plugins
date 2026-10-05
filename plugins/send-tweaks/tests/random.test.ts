import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULTS } from '../js/defaults'
import { setStorage } from '../js/lib/state'
import { applyRules, newRule } from '../js/lib/textReplace'
import { captureRandom, expandRandom, sendWithPreviewRandom, withSendRandom } from '../js/lib/random'

test('random templates are gated and work in plain and regex rules after unlock', () => {
	const original = Math.random
	Math.random = () => 0.5
	try {
		for (const regex of [false, true]) {
			const rule = newRule({ find: 'hi', replace: '$random{Hai, Hewo, Hey}!', regex })
			setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: false } } as any)
			assert.equal(applyRules('hi', [rule]).text, '$random{Hai, Hewo, Hey}!')
			setStorage({ cache: { ...DEFAULTS, greetingsUnlocked: true } } as any)
			assert.equal(applyRules('hi', [rule]).text, 'Hewo!')
		}
		assert.equal(expandRandom('$random{ , one, , two }'), 'two')
		assert.equal(expandRandom('$random{ , }'), '$random{ , }')
		assert.equal(expandRandom('$random{unfinished'), '$random{unfinished')
		assert.equal(expandRandom('$random{{name}, there}'), 'there')
	} finally { Math.random = original; setStorage({ cache: { ...DEFAULTS } } as any) }
})

test('preview choices are retained only for its unchanged next send', () => {
	const original = Math.random
	try {
		Math.random = () => 0
		const template = '$random{Hai, Hey} $random{one, two}'
		const preview = captureRandom(() => expandRandom(template))
		Math.random = () => 0.99
		sendWithPreviewRandom('hi', preview.choices, () => {
			assert.equal(withSendRandom('hi', () => expandRandom(template)), preview.result)
		})
		assert.equal(withSendRandom('hi', () => expandRandom(template)), 'Hey two')
		sendWithPreviewRandom('hi', preview.choices, () => {
			assert.equal(withSendRandom('changed', () => expandRandom(template)), 'Hey two')
		})
	} finally { Math.random = original }
})
