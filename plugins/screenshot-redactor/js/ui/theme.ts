/**
 * Discord's colour tokens, resolved for the theme in use (Ash, Dark, Onyx, Light).
 *
 * Same helper as hide-servers-drawer's ui/theme.ts; see docs/plugin-design-language.md §3.5.
 * Every colour takes the dark-theme hex it replaced as a fallback, so a renamed token costs one
 * wrong shade on a light theme rather than an invisible control.
 */

function tokenTables(): any {
	try {
		return (revenge.discord.common as any).tokens?.Tokens
	} catch {
		return undefined
	}
}

function currentTheme(): string {
	try {
		const store = (revenge.discord.flux.Stores as any).ThemeStore
		const theme = store?.theme ?? store?.getTheme?.()
		return typeof theme === "string" ? theme : "dark"
	} catch {
		return "dark"
	}
}

/** A colour by token name: raw names directly, semantic names through the current theme. */
export function token(name: string, fallback: string): string {
	const tables = tokenTables()
	if (!tables) return fallback
	try {
		const raw = tables.RawColor?.[name]
		if (typeof raw === "string") return raw
		const semantic = tables.SemanticColor?.[name]
		if (semantic) {
			const entry = semantic[currentTheme()] ?? semantic.darker ?? semantic.dark
			const resolved = entry?.raw ? tables.RawColor?.[entry.raw] : undefined
			if (typeof resolved === "string") return resolved
		}
	} catch {
		/* fall through to the hardcoded fallback */
	}
	return fallback
}

/** Off matches Discord"s secondary buttons; armed uses its destructive red. */
export const toggleBackground = (armed: boolean) =>
	armed
		? token("CONTROL_CRITICAL_PRIMARY_BACKGROUND_DEFAULT", "#F23F43")
		: token("CONTROL_SECONDARY_BACKGROUND_DEFAULT", "#2B2D31")
export const toggleIcon = (armed: boolean) =>
	armed
		? token("CONTROL_CRITICAL_PRIMARY_TEXT_DEFAULT", "#FFFFFF")
		: token("CONTROL_SECONDARY_TEXT_DEFAULT", "#FFFFFF")
export const toggleBorder = () => token("BORDER_SUBTLE", "#1E1F22")
