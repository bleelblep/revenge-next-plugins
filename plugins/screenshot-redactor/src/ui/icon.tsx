/**
 * A leading icon for a settings row, by icon name.
 *
 * `TableRowAssetIcon` (revenge.components) is what hide-call-buttons uses, but it takes one
 * name and a miss renders as a blank with no way to fall back. Icon naming also splits in two:
 * older icons are *registry assets* resolved by `getAssetIdByName`, while Discord's newer set
 * (the `redesign/generated/*.tsx` modules) are generated React *components* that only
 * `lookupGeneratedIconComponent` can see. `PaintbrushIcon` not resolving while `EyeSlashIcon`
 * did was exactly this split — so both are tried, in that order, for every name given. First
 * hit wins; if every name misses, the row simply gets no icon rather than a broken image.
 *
 * Call from inside a component's render: `revenge.*` is read here, so module scope is out
 * (docs/porting-rules.md rule 1).
 */
export function rowIcon(...names: string[]) {
	const { getAssetIdByName } = revenge.assets
	const { TableRow } = revenge.discord.design.Design

	for (const name of names) {
		try {
			const id = getAssetIdByName(name)
			if (id) return <TableRow.Icon source={id} />
		} catch {
			/* try the next name */
		}
	}

	try {
		const { lookupGeneratedIconComponent } = revenge.utils.discord
		for (const name of names) {
			const Component = lookupGeneratedIconComponent(name)
			if (Component) return <Component width={20} height={20} />
		}
	} catch {
		/* no icon then */
	}

	return undefined
}
