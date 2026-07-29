// Resolved via tsconfig `paths` for the "revenge" jsxImportSource (see tsconfig.json).
// TypeScript's jsx-runtime resolution needs an actual resolvable file, not just an ambient
// `declare module` block, so this exists as a real (types-only) module target. The exported
// `JSX` namespace mirrors @types/react/jsx-runtime's shape so `key`/children/attribute
// checking behaves the same as it would under the real "react" jsxImportSource.
export declare const jsx: (type: any, props: any, key?: any) => any
export declare const jsxs: (type: any, props: any, key?: any) => any
export declare const Fragment: unique symbol

export namespace JSX {
	// `any` rather than `ReactElement<any, any>` deliberately -- React 19's component return
	// types include `undefined`/`ReactNode`, which a stricter Element type rejects here since
	// this custom jsxImportSource doesn't get the same special-cased handling "react" does.
	type Element = any
	interface ElementAttributesProperty {
		props: {}
	}
	interface ElementChildrenAttribute {
		children: {}
	}
	interface IntrinsicAttributes {
		key?: string | number | null
	}
	interface IntrinsicElements {
		[elemName: string]: any
	}
}
