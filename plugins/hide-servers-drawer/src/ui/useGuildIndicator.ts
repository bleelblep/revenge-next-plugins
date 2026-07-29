import { guildNotificationState, settingsStore } from "../lib/notifications"

const { React } = revenge.react
// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
const { GuildReadStateStore } = revenge.discord.flux.Stores

export interface GuildIndicatorState {
	/** Mention count after notification-setting suppression -- 0 means no mention pill. */
	mentionCount: number
	/** Plain unread, after the same suppression rules. */
	showDot: boolean
}

/**
 * Shared by Badge.tsx (the corner badge) and GuildRow.tsx (the left-edge selection/unread
 * pill) so both agree on what counts as "this guild has something to show" -- a muted guild
 * suppresses both the same way, rather than the pill showing unread activity the badge has
 * already decided to hide.
 */
export function useGuildIndicator(guildId: string): GuildIndicatorState {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)

	React.useEffect(() => {
		const stores = [GuildReadStateStore, settingsStore()].filter(s => s?.addChangeListener)
		if (!stores.length) return
		const onChange = () => bump()
		stores.forEach(s => s.addChangeListener(onChange))
		return () => stores.forEach(s => s.removeChangeListener?.(onChange))
	}, [])

	let mentionCount = 0
	let hasUnread = false
	try {
		mentionCount = GuildReadStateStore?.getMentionCount?.(guildId) ?? 0
	} catch {
		/* ignore */
	}
	try {
		hasUnread = GuildReadStateStore?.hasUnread?.(guildId) ?? false
	} catch {
		/* ignore */
	}

	const { muted, onlyMentions, suppressed } = guildNotificationState(guildId)

	if (suppressed) return { mentionCount: 0, showDot: false }

	return {
		mentionCount,
		showDot: hasUnread && !muted && !onlyMentions,
	}
}
