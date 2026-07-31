// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// UI component can still be unregistered even from inside start() -- it only initializes
// once its screen actually renders. lookupModule gives up immediately and permanently caches
// that as "not found"; getModules subscribes and calls back whenever the module loads. Read
// lazily as a plain variable rather than React state -- there's nothing to re-render for
// here, `trailing` just omits the checkmark until it resolves.
let rowCheckmark: any
revenge.modules.finders.getModules(revenge.modules.finders.filters.withName("RowCheckmark"), (mod: any) => {
	rowCheckmark = mod
})

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
	// Read per-render, never at module scope -- see the "Never touch revenge.* at module scope"
	// section in the README. Design is a lazy proxy over lookupModule, and resolving it during
	// preInit poisons the shared filter key for the whole app, Revenge's own settings UI included.
	const { TableRow } = revenge.discord.design.Design

	const RowCheckmark = rowCheckmark
	return (
		<TableRow
			label={label}
			subLabel={subLabel}
			trailing={RowCheckmark ? <RowCheckmark selected={selected} /> : undefined}
			onPress={onPress}
		/>
	)
}
