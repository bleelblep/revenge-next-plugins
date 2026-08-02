import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { GhostLogStorage, DeleteStyle } from "../../types"

const STYLE_OPTIONS: Array<{
	value: DeleteStyle
	label: string
	subLabel: string
	icons: string[]
}> = [
	{
		value: "overlay",
		label: "Red overlay",
		subLabel: "Message gets a red background highlight with a red gutter bar.",
		icons: ["PaintPaletteIcon", "PaintbrushThinIcon"],
	},
	{
		value: "text",
		label: "Red text",
		subLabel: "Message content turns red, with a \"deleted\" tag.",
		icons: ["PencilIcon", "ic_edit"],
	},
	{
		value: "off",
		label: "Off",
		subLabel: "Messages disappear as normal. Logging still works.",
		icons: ["EyeSlashIcon"],
	},
]

export default function Visuals() {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRadioGroup, TableRadioRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<GhostLogStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRadioGroup
						title="Style"
						description="Styled messages stay in chat for this session only — they disappear on restart. The text log persists on disk until you clear it."
						hasIcons
						defaultValue={s.deleteStyle ?? DEFAULTS.deleteStyle}
						onChange={(deleteStyle: DeleteStyle) => set({ deleteStyle })}
					>
						{STYLE_OPTIONS.map(option => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								icon={rowIcon(...option.icons)}
								value={option.value}
							/>
						))}
					</TableRadioGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
