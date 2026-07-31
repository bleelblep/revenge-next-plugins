// Classic Revenge needed a two-tier colour system: a flat `colors` map plus a separate
// "semantic colour" resolver (@vendetta/ui's semanticColors + colorResolver.resolveSemanticColor).
// Revenge Next's `revenge.discord.design.Tokens` is assumed (unconfirmed) to expose already-
// resolved token strings directly -- see types/revenge.d.ts. If a token below reads wrong or
// doesn't track the user's theme, that assumption is the first thing to re-check.

export function token(name: string, fallback: string): string {
	try {
		const resolved = (revenge.discord.common.Tokens as any)?.[name]
		if (typeof resolved === "string") return resolved
	} catch {
		/* fall through to the hardcoded fallback */
	}

	return fallback
}

export const barBackground = () => token("BACKGROUND_BASE_LOWEST", "#1e1f22")
export const separator = () => token("BORDER_SUBTLE", "#2b2d31")
export const selectedPill = () => token("WHITE", "#ffffff")
export const iconInactive = () => token("MOBILE_GUILDBAR_ICON_DEFAULT", "#949ba4")
export const iconActive = () => token("WHITE", "#ffffff")
export const mentionBadge = () => token("STATUS_DANGER", "#ed4245")
export const unreadDot = () => token("WHITE", "#ffffff")
export const folderTint = (color?: number | null) => {
	if (color == null) return token("BACKGROUND_BRAND", "#5865f2")
	return `#${(color >>> 0).toString(16).padStart(6, "0").slice(-6)}`
}

// Stock's selected-icon fill: the Home button morphs from a circle with a neutral background
// to a rounded square filled with the theme's brand/accent color when selected. Reusing
// BACKGROUND_BRAND rather than a hardcoded hex is what makes this track the user's actual
// installed theme instead of always rendering Discord's default blurple.
export const selectedFill = () => token("BACKGROUND_BRAND", "#5865f2")

// Only used by ContextMenu.tsx, the fallback path for when the native action sheet (see
// lib/guildMenu.ts) isn't available -- kept theme-aware for the same reason as everything
// else here, but expect it to be reached rarely.
export const sheetBackground = () => token("MOBILE_ACTIONSHEET_BACKGROUND", "#2b2d31")
export const sheetBackdrop = () => "rgba(0,0,0,0.55)" // not a semantic token on any build seen so far
export const textMuted = () => token("TEXT_MUTED", "#949ba4")
export const textNormal = () => token("TEXT_DEFAULT", "#dbdee1")
export const dangerText = () => token("STATUS_DANGER", "#f23f42")
export const pressedOverlay = () => token("TABLEROW_BACKGROUND_PRESSED", "#35373c")
export const avatarFallback = () => token("MOBILE_GUILDBAR_ICON_BACKGROUND_DEFAULT", token("BACKGROUND_ACCENT", "#4e5058"))
