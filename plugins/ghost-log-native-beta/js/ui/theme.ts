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
		return typeof theme === 'string' ? theme : 'dark'
	} catch {
		return 'dark'
	}
}

/** A colour by token name: raw names directly, semantic names through the current theme. */
export function token(name: string, fallback: string): string {
	const tables = tokenTables()
	if (!tables) return fallback
	try {
		const raw = tables.RawColor?.[name]
		if (typeof raw === 'string') return raw
		const semantic = tables.SemanticColor?.[name]
		if (semantic) {
			const entry = semantic[currentTheme()] ?? semantic.darker ?? semantic.dark
			const resolved = entry?.raw ? tables.RawColor?.[entry.raw] : undefined
			if (typeof resolved === 'string') return resolved
		}
	} catch {
		/* fall through to the hardcoded fallback */
	}
	return fallback
}

export const groupHeaderText = () => token('TEXT_MUTED', '#B5BAC1')

/** The log's Prev / Page n / Next strip: Discord's secondary button colours. */
export const pagerBackground = (disabled: boolean) =>
	disabled ? token('BACKGROUND_MOD_SUBTLE', '#23262b') : token('CONTROL_SECONDARY_BACKGROUND_DEFAULT', '#2b2f36')
export const pagerText = (disabled: boolean) =>
	disabled ? token('TEXT_MUTED', '#6b7280') : token('CONTROL_SECONDARY_TEXT_DEFAULT', '#d7dce2')
export const pagerIndicatorBackground = () => token('BACKGROUND_MOD_SUBTLE', '#2b2f36')
export const pagerIndicatorBorder = () => token('BORDER_SUBTLE', '#3a3f47')
export const pagerIndicatorText = () => token('TEXT_DEFAULT', '#d7dce2')
