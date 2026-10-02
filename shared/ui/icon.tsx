/**
 * A leading icon for a settings row, by icon name. Shared by every plugin's `js/ui/icon.tsx`.
 *
 * Icon naming splits in two: older icons are *registry assets* resolved by `getAssetIdByName`,
 * while Discord's newer set (the `redesign/generated/*.tsx` modules) are generated React
 * *components* that only `lookupGeneratedIconComponent` can see. Each name is tried as an asset and
 * then as a component before moving on to the next name. First hit wins; if every name misses, the
 * row gets no icon rather than a broken image.
 *
 * The per-name order is the fix this file exists for. Fourteen plugins used to try *every* name as
 * an asset first and only then as components, which let a generic asset fallback at the end of the
 * list (`PuzzlePieceIcon`, `ic_settings`) beat a real component icon listed ahead of it.
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
	return findIcon(requested, false)
}

/**
 * The same, for a row with `variant="danger"`. The variant only colours the row's text; Discord
 * tells the icon separately, so stock danger rows are
 * `<TableRow variant="danger" icon={<TableRow.Icon IconComponent={X} variant="danger" />} />`
 * (348.5 bundle, e.g. ModeratorActionRow). This does the same for both kinds of icon: assets via
 * `source`, generated components via `IconComponent`. `TableRow.Icon`'s danger style is the
 * `TEXT_FEEDBACK_CRITICAL` colour. See docs/plugin-design-language.md §3.8.
 */
export function dangerIcon(...requested: string[]) {
	return findIcon(requested, true)
}

/** Only if `TableRow.Icon` is missing: the same colour it would use, from the theme. */
function criticalColour(): string {
	const fallback = '#f57976'
	try {
		const tables = (revenge.discord.common as any).tokens?.Tokens
		const semantic = tables?.SemanticColor?.TEXT_FEEDBACK_CRITICAL
		const store = (revenge.discord.flux.Stores as any).ThemeStore
		const theme = store?.theme ?? store?.getTheme?.()
		const entry = semantic?.[typeof theme === 'string' ? theme : 'dark'] ?? semantic?.darker ?? semantic?.dark
		const resolved = entry?.raw ? tables?.RawColor?.[entry.raw] : undefined
		return typeof resolved === 'string' ? resolved : fallback
	} catch {
		return fallback
	}
}

function findIcon(requested: string[], danger: boolean) {
	const names = [...new Set(requested.flatMap(name => [name, ...(ALIASES[name] ?? [])]))]
	const { getAssetIdByName } = revenge.assets
	const { TableRow, TableRowIcon } = revenge.discord.design.Design as any
	const AssetIcon = TableRow?.Icon ?? TableRowIcon
	let lookupComponent: ((name: string) => any) | undefined
	try {
		lookupComponent = revenge.utils.discord.lookupGeneratedIconComponent
	} catch {
		/* registry assets only then */
	}

	for (const name of names) {
		try {
			const id = getAssetIdByName(name)
			if (id && AssetIcon) return danger ? <AssetIcon source={id} variant="danger" /> : <AssetIcon source={id} />
		} catch {
			/* not an asset */
		}
		try {
			const Component = lookupComponent?.(name)
			if (Component) {
				if (!danger) return <Component width={20} height={20} />
				return AssetIcon ? (
					<AssetIcon IconComponent={Component} variant="danger" />
				) : (
					<Component width={20} height={20} color={criticalColour()} />
				)
			}
		} catch {
			/* not a component either */
		}
	}

	return undefined
}
