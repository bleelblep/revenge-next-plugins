/**
 * A leading icon for a settings row, by icon name.
 *
 * Copied from screenshot-redactor-dev. Icon naming splits in two: older icons are *registry
 * assets* resolved by `getAssetIdByName`, while Discord's newer set (the
 * `redesign/generated/*.tsx` modules) are generated React *components* that only
 * `lookupGeneratedIconComponent` can see. Both are tried, in that order, for every name
 * given. First hit wins; if every name misses, the row simply gets no icon rather than a
 * broken image.
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
