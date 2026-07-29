const { lookupModule } = revenge.modules.finders
const { withProps } = revenge.modules.finders.filters
const { findInReactTree } = revenge.utils.react

const Tag = lookupModule<any>(withProps("getBotLabel"))?.[0]

export default () => {
	if (!Tag) return () => {}

	return revenge.patcher.after(Tag, "default", ([{ text, textColor, backgroundColor }]: any[], ret: any) => {
		const label = findInReactTree(ret, (c: any) => typeof c?.props?.children === "string")
		if (!label) return ret

		if (text) label.props.children = text
		if (textColor && Array.isArray(label.props.style)) label.props.style.push({ color: textColor })
		if (backgroundColor && Array.isArray(ret?.props?.style)) ret.props.style.push({ backgroundColor })
		return ret
	})
}
