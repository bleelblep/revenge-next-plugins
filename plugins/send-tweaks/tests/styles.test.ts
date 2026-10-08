import assert from 'node:assert/strict'
import { test } from 'node:test'
import { DEFAULTS } from '../js/defaults'
import { setAi, setStorage } from '../js/lib/state'
import { allStyles, armRestyle, mask, PRESETS, pigLatinWord, restyle, takeRestyle, unmask } from '../js/lib/styles'
import { transform } from '../js/lib/transform'

const pig = PRESETS.find(style => style.id === 'pig-latin')!

test('pig latin words', () => {
	assert.equal(pigLatinWord('hello'), 'ellohay')
	assert.equal(pigLatinWord('apple'), 'appleway')
	assert.equal(pigLatinWord('Quick'), 'Ickquay')
	assert.equal(pigLatinWord('square'), 'aresquay')
	assert.equal(pigLatinWord('DON\'T'), 'ON\'TDAY')
	assert.equal(pigLatinWord('I'), 'Iway')
	assert.equal(pigLatinWord('hmm'), 'hmmay')
})

test('mask keeps links, mentions, emoji, code and placeholders', () => {
	const text = 'hey <@123> look https://x.com/a :smile: `code here` {timestamp} <:pog:999>'
	const { masked, spans } = mask(text)
	assert.equal(masked, 'hey ⟦0⟧ look ⟦1⟧ ⟦2⟧ ⟦3⟧ ⟦4⟧ ⟦5⟧')
	assert.equal(unmask(masked, spans), text)
	// Dropped tokens go at the end; unknown ones vanish.
	assert.equal(unmask('hi ⟦1⟧ ⟦9⟧', ['a', 'b', 'c']), 'hi b a c')
})

test('local style never touches protected spans', async () => {
	setStorage({ cache: { ...DEFAULTS } } as any)
	const out = await restyle('hello <@123> see https://example.com/path', pig)
	assert.ok(out.ok)
	assert.equal(out.ok && out.text, 'ellohay <@123> eesay https://example.com/path')
})

test('AI styles are hidden without AI Core and use its text call', async () => {
	setAi(undefined)
	assert.equal(allStyles(DEFAULTS).length, 0)
	const uwu = PRESETS.find(style => style.id === 'uwu')!
	assert.equal((await restyle('hi', uwu)).ok, false)

	let sent = ''
	setAi({
		isAvailable: () => true,
		json: async () => undefined,
		text: async (request: any) => {
			sent = request.messages[1].content
			return '"hewwo ⟦0⟧ uwu"'
		},
		budget: () => ({ configured: true, used: 0, cap: 1, remaining: 1 }),
	})
	const out = await restyle('hello <@42>', uwu)
	assert.equal(sent, 'hello ⟦0⟧')
	assert.ok(out.ok)
	assert.equal(out.ok && out.text, 'hewwo <@42> uwu')
	setAi(undefined)
})

test('a waiting restyle uses the sent message spans, once, and skips polish', () => {
	armRestyle({ masked: 'hewwo ⟦0⟧', spans: [':pog:'] })
	assert.equal(takeRestyle('hello <:pog:999>'), 'hewwo <:pog:999>')
	assert.equal(takeRestyle('hello <:pog:999>'), undefined)

	setStorage({ cache: { ...DEFAULTS, polishWording: true } } as any)
	assert.equal(transform('hewwo dont').text, "Hewwo don't")
	assert.equal(transform('hewwo dont', { polish: false }).text, 'hewwo dont')
})

test('built-in styles are off until switched on, custom styles follow', () => {
	assert.ok(PRESETS.every(style => style.local || /Example:/.test(style.prompt ?? '')))
	const styles = allStyles({
		enabledStyles: ['gen-z'],
		customStyles: [{ id: 'c1', name: 'Cowboy', prompt: 'a cowboy' }, { id: 'c2', name: '', prompt: 'x' }],
	})
	assert.deepEqual(styles.map(style => style.id), ['gen-z', 'c1'])
	assert.equal(styles.at(-1)?.name, 'Cowboy')
	assert.ok(!styles.some(style => style.id === 'c2'))
})
