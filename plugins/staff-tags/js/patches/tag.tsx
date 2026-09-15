import { findInReactTree } from "../lib/findInReactTree"

// getModules, not lookupModule: confirmed on-device that a related lookup (getTagProperties
// in chat.ts) isn't loaded yet on a cold app restart even from inside start() -- it's part
// of the chat UI, which only initializes once the chat screen actually renders. lookupModule
// gives up immediately and permanently caches that as "not found"; getModules subscribes and
// calls back whenever the module actually loads.
export default () => {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	let unpatch: (() => void) | undefined

	const unsubscribe = getModules(withProps("getBotLabel"), (Tag: any) => {
		if (!Tag) return

		// instead, not after: after's hook only receives the return value, not the original
		// arguments (confirmed from revenge-bundle-next's own patcher source).
		unpatch = revenge.patcher.instead(Tag, "default", (args: any[], original: any) => {
			// Confirmed on-device crash: "undefined is not a function" here -- the target
			// property wasn't actually a function yet when we patched it (a getModules match
			// on partially-populated exports). Never assume a captured original is callable.
			if (typeof original !== "function") return undefined
			const ret = original(...args)
			const [{ text, textColor, backgroundColor }] = args
			const label = findInReactTree(ret, (c: any) => typeof c?.props?.children === "string")
			if (!label) return ret

			if (text) label.props.children = text
			if (textColor && Array.isArray(label.props.style)) label.props.style.push({ color: textColor })
			if (backgroundColor && Array.isArray(ret?.props?.style)) ret.props.style.push({ backgroundColor })
			return ret
		})
	})

	return () => {
		unsubscribe()
		unpatch?.()
	}
}
