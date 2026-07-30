import { type RecentDm, dmUnreadState, mostRecentDm, subscribeDmChanges } from "../../lib/dms"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import { avatarFallback, barBackground, mentionBadge, selectedFill, unreadDot } from "../theme"
import MorphIcon from "./MorphIcon"
import Pill from "./Pill"

const { React } = revenge.react
const { Pressable, View, Image, Text } = revenge.react.ReactNative
// getAssetIdByName (lowercase "d"), under revenge.assets not revenge.components -- confirmed
// from revenge-bundle-next's own source.
const { getAssetIdByName } = revenge.assets

const ChatIcon = getAssetIdByName("ChatIcon") ?? getAssetIdByName("ic_message")

const SIZE = ICON_SIZE
const GLYPH = 24
const ROW_HEIGHT = SIZE + 20

function avatarUrl(recipient: RecentDm["recipientAvatar"]): string | undefined {
	if (!recipient?.avatar) return undefined
	const ext = recipient.avatar.startsWith("a_") ? "gif" : "png"
	return `https://cdn.discordapp.com/avatars/${recipient.id}/${recipient.avatar}.${ext}?size=64`
}

/**
 * Stock Discord's Home button shows the most recent DM conversation's avatar (with unread
 * state) rather than a static icon, and morphs from a circle with a neutral fill to a
 * rounded square filled with the theme's accent color when selected, same as every other
 * icon in the bar. Falls back to the chat bubble glyph on its own background circle/square
 * for group DMs (no single avatar to show) or when there's no DM history at all.
 */
export default function DmIcon({ selected, onPress }: { selected: boolean; onPress: () => void }) {
	const [, bump] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => subscribeDmChanges(bump), [])

	const recent = mostRecentDm()
	const url = recent?.type === 1 ? avatarUrl(recent.recipientAvatar) : undefined
	const { hasUnread, mentionCount } = recent ? dmUnreadState(recent.channelId) : { hasUnread: false, mentionCount: 0 }

	// Full bar-width row so the pill sits at left: 0 inside it -- see ui/layout.ts.
	return (
		<Pressable onPress={onPress} style={{ width: BAR_WIDTH, height: ROW_HEIGHT, alignItems: "center", justifyContent: "center" }}>
			<Pill rowHeight={ROW_HEIGHT} selected={selected} />

			<View style={{ width: SIZE, height: SIZE }}>
				{url ? (
					<MorphIcon size={SIZE} selected={selected}>
						<Image source={{ uri: url }} style={{ width: SIZE, height: SIZE }} />
					</MorphIcon>
				) : (
					<MorphIcon size={SIZE} selected={selected} background={avatarFallback()} selectedBackground={selectedFill()}>
						<Image source={ChatIcon as any} style={{ width: GLYPH, height: GLYPH, tintColor: "#fff" }} />
					</MorphIcon>
				)}

				{mentionCount > 0 ? (
					<View style={[st.pillOutline, { backgroundColor: barBackground() }]}>
						<View style={[st.pill, { backgroundColor: mentionBadge() }]}>
							<Text style={st.pillText}>{mentionCount > 99 ? "99+" : String(mentionCount)}</Text>
						</View>
					</View>
				) : hasUnread ? (
					<View style={[st.dotOutline, { backgroundColor: barBackground() }]}>
						<View style={[st.dot, { backgroundColor: unreadDot() }]} />
					</View>
				) : null}
			</View>
		</Pressable>
	)
}

// Offsets are relative to the 48x48 icon box (matching UnreadDmRow/Badge), not the row.
const st = {
	pillOutline: {
		position: "absolute" as const,
		bottom: -3,
		right: -3,
		minWidth: 23,
		minHeight: 23,
		borderRadius: 12,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	pill: {
		minWidth: 19,
		height: 19,
		borderRadius: 9,
		paddingHorizontal: 5,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	pillText: { color: "#fff", fontSize: 10, fontWeight: "700" as const, lineHeight: 19 },
	dotOutline: {
		position: "absolute" as const,
		bottom: -2,
		right: -2,
		width: 14,
		height: 14,
		borderRadius: 7,
		alignItems: "center" as const,
		justifyContent: "center" as const,
	},
	dot: { width: 10, height: 10, borderRadius: 5 },
}
