import type { Context, ReactNode } from 'react'

/** The live composer handle, scoped to its own send button through React context. */
type ComposerRef = { current?: { getText?: () => unknown } | null }

let context: Context<ComposerRef | undefined> | undefined

export function composerContext(): Context<ComposerRef | undefined> {
	return (context ??= revenge.react.React.createContext<ComposerRef | undefined>(undefined))
}

/** Find the handle Discord passes to its autocomplete/accessory children, without component names. */
function findComposerRef(node: any): ComposerRef | undefined {
	if (!node || typeof node !== 'object') return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const ref = findComposerRef(child)
			if (ref) return ref
		}
		return undefined
	}
	const ref = node.props?.chatInputRef
	if (ref && typeof ref === 'object' && 'current' in ref) return ref
	return findComposerRef(node.props?.children)
}

export function patchComposer(): () => void {
	let undo: (() => void) | undefined
	let active = true
	const unsubscribe = revenge.discord.utils.modules.finders.getModuleWithImportedPath(
		'modules/chat_input/native/ChatInput.tsx',
		(exports: any) => {
			const target = exports?.default?.type
			const original = target?.render
			if (!active || undo || typeof original !== 'function') return
			const Context = composerContext()
			const wrapper = function (this: unknown, ...args: any[]) {
				const tree = Reflect.apply(original, this, args) as ReactNode
				if (!active) return tree
				return revenge.react.React.createElement(
					Context.Provider,
					{ value: findComposerRef(tree) },
					tree,
				)
			}
			target.render = wrapper
			undo = () => {
				if (target.render === wrapper) target.render = original
			}
		},
	)
	return () => {
		active = false
		unsubscribe?.()
		undo?.()
	}
}

/** Read at release time, not render time: typing does not necessarily re-render the send button. */
export function readComposer(ref: ComposerRef | undefined): string | undefined {
	const text = ref?.current?.getText?.()
	return typeof text === 'string' ? text : undefined
}
