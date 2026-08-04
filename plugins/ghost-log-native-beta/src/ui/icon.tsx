/**
 * A leading icon for a settings row, by icon name. Older icons are registry assets resolved by
 * `getAssetIdByName`, newer ones are generated React components found via
 * `lookupGeneratedIconComponent`. Both are tried per name; first hit wins, otherwise no icon.
 *
 * Call from inside a component's render: `revenge.*` is read here, so module scope is out.
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
