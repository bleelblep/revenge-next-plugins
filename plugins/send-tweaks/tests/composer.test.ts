import assert from 'node:assert/strict'
import { test } from 'node:test'
import { composerContext, patchComposer, readComposer } from '../js/lib/composer'

test('preview reads the live composer per button, including cleared drafts, and cleans up', () => {
	const globals = globalThis as any
	const previous = globals.revenge
	let register: (exports: any) => void = () => {}
	let unsubscribed = false
	globals.revenge = {
		react: {
			React: {
				createContext: () => ({ Provider: {} }),
				createElement: (type: any, props: any, child: any) => ({ type, props: { ...props, children: child } }),
			},
		},
		discord: {
			utils: {
				modules: {
					finders: {
						getModuleWithImportedPath: (path: string, callback: typeof register) => {
							assert.equal(path, 'modules/chat_input/native/ChatInput.tsx')
							register = callback
							return () => { unsubscribed = true }
						},
					},
				},
			},
		},
	}
	let cleanup: (() => void) | undefined
	try {
		cleanup = patchComposer()
		const receiver = {}
		const original = function (this: unknown, ref: any) {
			assert.equal(this, receiver)
			return { props: { children: [null, { props: { chatInputRef: ref } }] } }
		}
		const target = { render: original }
		register({ default: { type: target } })
		let live = 'first draft'
		const ref = { current: { getText: () => live } }
		const first = target.render.call(receiver, ref) as any
		assert.equal(first.type, composerContext().Provider)
		assert.equal(readComposer(first.props.value), 'first draft')
		live = 'typed after the button rendered'
		assert.equal(readComposer(first.props.value), live)
		const second = target.render.call(receiver, { current: { getText: () => 'other channel' } }) as any
		assert.equal(readComposer(second.props.value), 'other channel')
		assert.equal(readComposer(first.props.value), live)
		live = ''
		assert.equal(readComposer(first.props.value), '')
		assert.equal(readComposer(undefined), undefined)
		assert.equal(readComposer({ current: null }), undefined)
		assert.equal(readComposer({ current: { getText: () => Promise.resolve('not synchronous') } }), undefined)
		cleanup()
		assert.equal(target.render, original)
		assert.equal(unsubscribed, true)
	} finally {
		cleanup?.()
		globals.revenge = previous
	}
})
