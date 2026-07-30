// `revenge.utils.react.findInReactTree` doesn't exist -- was a guess (by analogy with classic
// Revenge/Vendetta's @vendetta/utils), confirmed wrong on-device ("undefined is not a
// function" while rendering a patched Tag component in the member list). The real
// revenge-bundle-next source has a differently-named `findInReactFiber` (lib/utils/src/react.ts),
// walking fiber-specific fields, and its availability on the external plugin API is
// unconfirmed either way -- so this is a self-contained walker instead, matching classic
// Vendetta's findInReactTree semantics: walk a rendered element's `props.children` (single
// node or array) recursively for the first match.
export function findInReactTree(root: any, predicate: (node: any) => boolean, depth = 0): any {
	if (!root || typeof root !== "object" || depth > 30) return undefined
	if (predicate(root)) return root

	const children = root.props?.children
	if (Array.isArray(children)) {
		for (const child of children) {
			const found = findInReactTree(child, predicate, depth + 1)
			if (found) return found
		}
	} else if (children && typeof children === "object") {
		const found = findInReactTree(children, predicate, depth + 1)
		if (found) return found
	}

	return undefined
}
