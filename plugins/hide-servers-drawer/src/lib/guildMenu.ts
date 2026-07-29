const { lookupModule } = revenge.modules.finders
const { withPredicate, withProps } = revenge.modules.finders.filters

// getGuildsBarGuildMenuItems is assumed findable only by its inner function name (matching
// classic Revenge, where findByName/findByDisplayName missed it) -- takes a guildId, returns
// the real stock long-press menu, each item shaped { IconComponent, label, action }.
let menuItemsFn: ((guildId: string) => any[]) | undefined

function resolveMenuItemsFn() {
	if (menuItemsFn !== undefined) return menuItemsFn
	try {
		menuItemsFn = lookupModule<any>(
			withPredicate((m: any) => m?.default?.name === "getGuildsBarGuildMenuItems"),
		)?.[0]?.default
	} catch {
		menuItemsFn = undefined
	}
	return menuItemsFn
}

const showSimpleActionSheet = lookupModule<any>(withProps("showSimpleActionSheet"))?.[0]?.showSimpleActionSheet

export interface MenuItem {
	label: string
	danger?: boolean
	action: () => void
}

/** Real per-guild stock menu items. Empty array if the lookup fails on this build. */
export function stockMenuItems(guildId: string): MenuItem[] {
	const fn = resolveMenuItemsFn()
	if (!fn) return []

	try {
		const raw = fn(guildId) ?? []
		if (!Array.isArray(raw)) return []

		return raw
			.filter((item: any) => item && typeof item.action === "function" && item.label)
			.map((item: any) => ({
				label: String(item.label),
				// Real stock items never carry this, but third-party plugins that also append
				// to this same shared array (e.g. purge-my-messages) might mark their own item
				// destructive -- preserve it instead of silently dropping it.
				danger: !!(item.danger || item.variant === "destructive" || item.isDestructive),
				action: () => item.action(),
			}))
	} catch {
		return []
	}
}

/**
 * Try Discord's own action sheet for pixel-identical chrome. Returns true only if the call
 * completed without throwing; there is no signal available here for "opened but rendered
 * wrong", so a bad guess at the payload shape needs to be caught by eye.
 */
export function openNativeActionSheet(title: string, items: MenuItem[]): boolean {
	if (typeof showSimpleActionSheet !== "function" || !items.length) return false

	try {
		showSimpleActionSheet({
			key: "HideServersDrawerGuildMenu",
			header: { title },
			options: items.map(item => ({
				label: item.label,
				isDestructive: !!item.danger,
				onPress: item.action,
			})),
		})
		return true
	} catch {
		return false
	}
}
