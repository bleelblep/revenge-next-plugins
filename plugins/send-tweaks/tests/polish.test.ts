import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addFullStop, capitaliseI, capitaliseSentences, fixApostrophes, polish } from '../js/lib/polish'

const all = { apostrophes: true, capitals: true, fullStop: true, skip: [] }

test('apostrophes keep the case and skip real words', () => {
	assert.equal(fixApostrophes('dont DONT Dont im'), "don't DON'T Don't I'm")
	assert.equal(fixApostrophes('ill wed shed its were well'), 'ill wed shed its were well')
	assert.equal(fixApostrophes('dontcha'), 'dontcha')
})

test('sentences and i', () => {
	assert.equal(capitaliseI("i think i'm ok, i.e. fine"), "I think I'm ok, i.e. fine")
	assert.equal(capitaliseI('wifi is hi'), 'wifi is hi')
	assert.equal(capitaliseSentences('hi. how are you? good!\nnew line'), 'Hi. How are you? Good!\nNew line')
	assert.equal(capitaliseSentences('well... maybe. e.g. this'), 'Well... maybe. E.g. this')
	assert.equal(capitaliseSentences('iphone is fine. iPhone too'), 'Iphone is fine. iPhone too')
	assert.equal(capitaliseSentences('lol ok. lol', ['lol']), 'lol ok. lol')
	assert.equal(capitaliseSentences('"quoted" text'), '"Quoted" text')
	assert.equal(capitaliseSentences(' hey'), ' hey')
})

test('full stop only after a word', () => {
	assert.equal(addFullStop('hello  '), 'hello.  ')
	assert.equal(addFullStop('hello!'), 'hello!')
	assert.equal(addFullStop('hello :)'), 'hello :)')
})

test('all together', () => {
	assert.equal(polish('i dont know. thats fine', all), "I don't know. That's fine.")
})
