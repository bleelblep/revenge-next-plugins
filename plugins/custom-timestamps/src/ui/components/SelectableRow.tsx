const { lookupModule } = revenge.modules.finders
const { withName } = revenge.modules.finders.filters

const { TableRow } = revenge.discord.design.Design
const RowCheckmark = lookupModule<any>(withName("RowCheckmark"))?.[0]

export function SelectableRow({
	label,
	subLabel,
	selected,
	onPress,
}: {
	label: string
	subLabel?: string
	selected: boolean
	onPress: () => void
}) {
	return (
		<TableRow
			label={label}
			subLabel={subLabel}
			trailing={RowCheckmark ? <RowCheckmark selected={selected} /> : undefined}
			onPress={onPress}
		/>
	)
}
