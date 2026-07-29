import { cancelPurge, confirmAndPurge, isPurging } from "../ui/confirmAndPurge"

const { lookupModule } = revenge.modules.finders
const { withPredicate, withStoreName } = revenge.modules.finders.filters

/**
 * Appends one item to the real per-guild long-press menu (getGuildsBarGuildMenuItems, same
 * lookup Hide Servers (Drawer Fix) uses) rather than building a custom menu -- the native
 * menu already renders wherever the guild bar's long-press opens it, native chrome included.
 */
export default function patchGuildMenu(): () => void {
	const found = lookupModule<any>(
		withPredicate((m: any) => m?.default?.name === "getGuildsBarGuildMenuItems"),
	)
	const mod = found?.[0]
	if (!mod?.default) return () => {}

	const GuildStore = lookupModule<any>(withStoreName("GuildStore"))?.[0]

	return revenge.patcher.after(mod, "default", (args: any[], ret: any) => {
		const guildId = args?.[0]
		if (!guildId || !Array.isArray(ret)) return ret

		let guildName = "this server"
		try {
			guildName = GuildStore?.getGuild?.(String(guildId))?.name ?? guildName
		} catch {
			/* ignore */
		}

		const id = String(guildId)
		const item = isPurging(id)
			? { label: "Cancel purge", action: () => cancelPurge(id) }
			: { label: "Delete my messages", variant: "destructive", action: () => confirmAndPurge(id, guildName) }

		return [...ret, item]
	})
}
