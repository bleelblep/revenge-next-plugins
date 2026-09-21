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
/**
 * Other names to try for an icon Discord has removed. There is no standalone sparkle in 348:
 * `SparklesIcon` is gone and `SparkleIcon` only survives inside `PencilSparkleIcon` /
 * `ImageSparkleIcon`. Installed manifests may still carry either, so both fall back to the wand.
 */
const ALIASES: Record<string, string[]> = {
	SparklesIcon: ['MagicWandIcon'],
	SparkleIcon: ['MagicWandIcon'],
}

export function rowIcon(...requested: string[]) {
	const names = [...new Set(requested.flatMap(name => [name, ...(ALIASES[name] ?? [])]))]
	const { getAssetIdByName } = revenge.assets
	const { TableRow } = revenge.discord.design.Design
	let lookupComponent: ((name: string) => any) | undefined
	try {
		lookupComponent = revenge.utils.discord.lookupGeneratedIconComponent
	} catch {
		/* registry assets only then */
	}

	// Per name, asset then component, before moving on. Trying every name as an asset first let a
	// generic asset fallback (`PuzzlePieceIcon`) beat a real component icon listed ahead of it.
	for (const name of names) {
		try {
			const id = getAssetIdByName(name)
			if (id) return <TableRow.Icon source={id} />
		} catch {
			/* not an asset */
		}
		try {
			const Component = lookupComponent?.(name)
			if (Component) return <Component width={20} height={20} />
		} catch {
			/* not a component either */
		}
	}

	return undefined
}
