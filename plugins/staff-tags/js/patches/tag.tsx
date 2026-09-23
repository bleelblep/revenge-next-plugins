import { findInReactTree } from '../lib/findInReactTree'
import TagIcon from '../ui/TagIcon'

/**
 * Paints the resolved tag: its text, colours, optional icon and optional gradient.
 *
 * getModules, not lookupModule: confirmed on-device that a related lookup (getTagProperties
 * in chat.ts) isn't loaded yet on a cold app restart even from inside start() -- it's part
 * of the chat UI, which only initializes once the chat screen actually renders. lookupModule
 * gives up immediately and permanently caches that as "not found"; getModules subscribes and
 * calls back whenever the module actually loads.
 */

function lazy<T>(resolve: () => T): () => T {
	let value: T
	let done = false
	return () => {
		if (!done) {
			value = resolve()
			done = true
		}
		return value
	}
}

/**
 * `react-native-linear-gradient`, confirmed present on 348.1 (module exporting `LinearGradient`).
 * Resolved lazily and treated as optional: without it a gradient tag falls back to its solid
 * first colour rather than disappearing.
 */
const linearGradient = lazy<any>(() => {
	try {
		const { lookupModules } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		// Several modules carry a `LinearGradient` export and the first match is NOT the
		// component: on 348.1 module 5201 exports the *string* "LinearGradient", the native
		// view-config name. Handing a string to createElement asks React for an unknown host
		// component, which draws nothing and can take the native renderer down with it. Only a
		// function is a component, so keep looking until one turns up.
		for (const [mod] of lookupModules(withProps('LinearGradient'))) {
			const exports = mod as any
			const candidate = exports?.LinearGradient ?? exports?.default
			if (typeof candidate === 'function') return candidate
		}
		return undefined
	} catch {
		return undefined
	}
})

export default () => {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters
	const React = revenge.react.React

	let unpatch: (() => void) | undefined

	const unsubscribe = getModules(withProps('getBotLabel'), (Tag: any) => {
		if (!Tag) return

		// instead, not after: after's hook only receives the return value, not the original
		// arguments (confirmed from revenge-bundle-next's own patcher source).
		unpatch = revenge.patcher.instead(Tag, 'default', (args: any[], original: any) => {
			// Confirmed on-device crash: "undefined is not a function" here -- the target
			// property wasn't actually a function yet when we patched it (a getModules match
			// on partially-populated exports). Never assume a captured original is callable.
			if (typeof original !== 'function') return undefined
			const ret = original(...args)
			const [props] = args
			const { text, textColor, backgroundColor, gradientColor, icon, customSvg, iconOnly } =
				props ?? {}
			const label = findInReactTree(ret, (c: any) => typeof c?.props?.children === 'string')
			if (!label) return ret

			if (text) label.props.children = iconOnly && icon ? '' : text
			if (textColor && Array.isArray(label.props.style))
				label.props.style.push({ color: textColor })
			if (backgroundColor && Array.isArray(ret?.props?.style))
				ret.props.style.push({ backgroundColor })

			// The icon goes in the tag's own row, not inside the label: an SVG nested in a Text
			// does not render on Android.
			if (icon) {
				try {
					const iconElement = (
						<TagIcon
							key="staff-tags-icon"
							icon={icon}
							customSvg={customSvg}
							color={textColor ?? '#FFFFFF'}
						/>
					)
					const children = ret.props.children
					ret.props.children = Array.isArray(children)
						? [iconElement, ...children]
						: [iconElement, children]
				} catch {
					/* an icon is decoration; never let it cost the tag */
				}
			}

			// A gradient replaces the tag's background, so the element has to become one that can
			// draw it. Same props and children, different host component.
			if (gradientColor && backgroundColor) {
				const Gradient = linearGradient()
				if (Gradient) {
					try {
						return React.createElement(
							Gradient,
							{
								colors: [backgroundColor, gradientColor],
								start: { x: 0, y: 0.5 },
								end: { x: 1, y: 0.5 },
								style: ret.props.style,
							},
							ret.props.children,
						)
					} catch {
						/* fall through to the solid tag below */
					}
				}
			}

			return ret
		})
	})

	return () => {
		unsubscribe()
		unpatch?.()
	}
}
