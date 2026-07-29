import type { UnreadDm } from "../../lib/dms"
import { BAR_WIDTH, ICON_SIZE } from "../layout"
import { avatarFallback, barBackground, mentionBadge, selectedFill, unreadDot } from "../theme"
import MorphIcon from "./MorphIcon"
import Pill from "./Pill"

const { React } = revenge.react
const { Pressable, View, Image, Text } = revenge.react.ReactNative

const { lookupModule } = revenge.modules.finders
const { withProps } = revenge.modules.finders.filters

const ChannelActions = lookupModule<any>(withProps("selectPrivateChannel"))?.[0]

const SIZE = ICON_SIZE

// Group DMs read as two overlapping member avatars, not a sparse 2x2 grid of tiny icons.
// Each avatar is large enough to actually recognise, with the front one ringed in the bar's
// own background colour to separate the two.
const STACK = 32
const RING = 2

function acronym(name: string): string {
	return String(name ?? "")
		.replace(/\w+/g, word => word[0] ?? "")
		.replace(/\s/g, "")
		.slice(0, 2)
		.toUpperCase()
}

function MemberAvatar({ member, size, fontSize }: { member: { url?: string; username: string }; size: number; fontSize: number }) {
	if (member.url) {
		return <Image source={{ uri: member.url }} style={{ width: size, height: size, borderRadius: size / 2 }} />
	}
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: size / 2,
				backgroundColor: avatarFallback(),
				alignItems: "center",
				justifyContent: "center",
			}}
		>
			<Text style={{ color: "#fff", fontSize, fontWeight: "600" }}>{acronym(member.username)}</Text>
		</View>
	)
}

/** Two overlapping avatars: first back/top-left, second front/bottom-right with a ring. */
function GroupAvatars({ members }: { members: Array<{ id: string; url?: string; username: string }> }) {
	const [back, front] = members

	return (
		<View style={{ width: SIZE, height: SIZE }}>
			<View style={{ position: "absolute", top: 0, left: 0 }}>
				<MemberAvatar member={back} size={STACK} fontSize={12} />
			</View>
			{front ? (
				<View
					style={{
						position: "absolute",
						bottom: 0,
						right: 0,
						padding: RING,
						borderRadius: (STACK + RING * 2) / 2,
						backgroundColor: barBackground(),
					}}
				>
					<MemberAvatar member={front} size={STACK} fontSize={12} />
				</View>
			) : null}
		</View>
	)
}

/**
 * Same shape/size as GuildRow, one per unread DM/group-DM -- see lib/dms.ts. Memoised for
 * the same reason GuildRow is: the bar re-renders on every DM store emit, and rebuilding
 * every row's avatar each time flashes the bar.
 */
function UnreadDmRow({ dm, selected }: { dm: UnreadDm; selected: boolean }) {
	const navigate = React.useCallback(() => {
		revenge.discord.haptics.trigger("soft")
		try {
			ChannelActions?.selectPrivateChannel?.(dm.channelId)
		} catch {
			/* ignore */
		}
	}, [dm.channelId])

	return (
		<Pressable onPress={navigate}>
			{/* Full bar-width row, icon centred, pill at left: 0 inside it -- see ui/layout.ts. */}
			<View style={{ width: BAR_WIDTH, height: SIZE, alignItems: "center", justifyContent: "center" }}>
				<Pill rowHeight={SIZE} selected={selected} />

				<View style={{ width: SIZE, height: SIZE }}>
					{dm.avatarUrl ? (
						<MorphIcon size={SIZE} selected={selected}>
							<Image source={{ uri: dm.avatarUrl }} style={{ width: SIZE, height: SIZE }} />
						</MorphIcon>
					) : dm.memberAvatars?.length ? (
						<MorphIcon size={SIZE} selected={selected}>
							<GroupAvatars members={dm.memberAvatars.slice(0, 2)} />
						</MorphIcon>
					) : (
						<MorphIcon size={SIZE} selected={selected} background={avatarFallback()} selectedBackground={selectedFill()}>
							<Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>{acronym(dm.name)}</Text>
						</MorphIcon>
					)}

					{dm.mentionCount > 0 ? (
						<View style={[st.pillOutline, { backgroundColor: barBackground() }]}>
							<View style={[st.pill, { backgroundColor: mentionBadge() }]}>
								<Text style={st.pillText}>{dm.mentionCount > 99 ? "99+" : String(dm.mentionCount)}</Text>
							</View>
						</View>
					) : dm.hasUnread ? (
						<View style={[st.dotOutline, { backgroundColor: barBackground() }]}>
							<View style={[st.dot, { backgroundColor: unreadDot() }]} />
						</View>
					) : null}
				</View>
			</View>
		</Pressable>
	)
}

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

export default React.memo(UnreadDmRow)
