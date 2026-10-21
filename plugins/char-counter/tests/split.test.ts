import assert from 'node:assert/strict'
import { test } from 'node:test'
import { estimateParts, splitMessage } from '../js/lib/split'

const fits = (parts: string[], max: number) =>
	parts.every(part => part.length > 0 && part.length <= max)

test('a message within the limit is left alone', () => {
	assert.deepEqual(splitMessage('hello', 2000), ['hello'])
	assert.deepEqual(splitMessage('x'.repeat(2000), 2000), ['x'.repeat(2000)])
})

test('cuts at a blank line before a line break, a sentence end or a space', () => {
	const paragraphs = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n${'c'.repeat(30)}`
	assert.deepEqual(splitMessage(paragraphs, 70), [
		`${'a'.repeat(30)}\n\n${'b'.repeat(30)}`,
		'c'.repeat(30),
	])

	const lines = `${'a'.repeat(30)}\n${'b'.repeat(30)}\n${'c'.repeat(30)}`
	assert.deepEqual(splitMessage(lines, 70), [
		`${'a'.repeat(30)}\n${'b'.repeat(30)}`,
		'c'.repeat(30),
	])

	const sentences =
		'One two three four. Five six seven eight! Nine ten eleven twelve? Thirteen.'
	const parts = splitMessage(sentences, 45)
	assert.deepEqual(parts, [
		'One two three four. Five six seven eight!',
		'Nine ten eleven twelve? Thirteen.',
	])

	const words = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
	const byWord = splitMessage(words, 60)
	assert.ok(fits(byWord, 60))
	assert.ok(byWord.every(part => !part.startsWith(' ') && !part.endsWith(' ')))
	assert.equal(byWord.join(' '), words)
})

test('never makes a part smaller than half the budget just to hit a boundary', () => {
	// A blank line very early would give a tiny first part; a later line break is used instead.
	const text = `short\n\n${'x'.repeat(50)}\n${'y'.repeat(50)}`
	const parts = splitMessage(text, 80)
	assert.ok(fits(parts, 80))
	assert.ok(parts[0].length >= 40, parts[0])
})

test('one enormous word is cut hard, without splitting an emoji', () => {
	const parts = splitMessage('x'.repeat(4500), 2000)
	assert.deepEqual(
		parts.map(part => part.length),
		[2000, 2000, 500],
	)

	const emoji = `a${'😀'.repeat(1001)}` // 2003 UTF-16 units; the cut at 2000 would land mid-emoji
	const [a, b] = splitMessage(emoji, 2000)
	assert.equal(a.length, 1999)
	assert.equal(b.length, 4)
	assert.ok(!/[\ud800-\udbff]$/.test(a))
})

test('a code block across a cut is closed and reopened with its language', () => {
	const code = Array.from({ length: 30 }, (_, i) => `    line ${i};`).join('\n')
	const text = `Look:\n\`\`\`js\n${code}\n\`\`\`\nafter`
	const parts = splitMessage(text, 200)
	assert.ok(fits(parts, 200))
	assert.ok(parts.length >= 2)
	for (let i = 0; i < parts.length - 1; i++)
		assert.ok(parts[i].endsWith('\n```'), parts[i])
	for (let i = 1; i < parts.length; i++)
		assert.ok(parts[i].startsWith('```js\n'), parts[i])
	// Every part has balanced fences and the code's indentation is intact.
	for (const part of parts)
		assert.equal((part.match(/```/g) ?? []).length % 2, 0, part)
	assert.ok(parts[1].includes('\n    line '), parts[1])
	assert.ok(parts[parts.length - 1].endsWith('after'))
})

test('a closed code block before the cut needs no fences', () => {
	const text = `\`\`\`\nshort\n\`\`\`\n${'p'.repeat(40)}\n\n${'q'.repeat(40)}`
	const parts = splitMessage(text, 60)
	assert.ok(fits(parts, 60))
	assert.ok(
		parts.every(part => (part.match(/```/g) ?? []).length % 2 === 0),
		parts.join(' | '),
	)
})

test('estimateParts rounds up and never says zero', () => {
	assert.equal(estimateParts(0, 2000), 1)
	assert.equal(estimateParts(2001, 2000), 2)
	assert.equal(estimateParts(6000, 2000), 3)
	assert.equal(estimateParts(100, 0), 1)
})
