import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { AntiGhostPingStorage, GhostPing } from "../../types"
import Avatar from "../components/Avatar"

const REASON_LABEL: Record<GhostPing["reason"], string> = {
	direct: "mentioned you",
	reply: "replied to you",
	everyone: "@everyone",
	role: "role ping",
}

/** "3m ago" / "2h ago" / "5d ago" — absolute times aren't useful in a log you skim. */
function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return "just now"
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

/**
 * Groups by origin — server, or DMs — rather than by day. The first thing you want from this log
 * is "where did this come from", and the server icon makes that scannable at a glance. Time is
 * still on every row.
 */
function groupByOrigin(entries: GhostPing[]) {
	const groups = new Map<string, { label: string; icon?: string; id?: string; items: GhostPing[] }>()

	for (const entry of entries) {
		const key = entry.guildId ?? "@me"
		const existing = groups.get(key)
		if (existing) existing.items.push(entry)
		else {
			groups.set(key, {
				label: entry.guildName ?? "Direct messages",
				icon: entry.guildIcon,
				id: entry.guildId,
				items: [entry],
			})
		}
	}

	return [...groups.values()]
}

export default function Log() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View, Text } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	// Rendered as a plain navigator route, so there's no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries = s.log ?? []
	// Hook-based, so called unconditionally above either return branch.
	const bottomPadding = useBottomPadding()

	if (!entries.length) {
		return (
			<Page>
				<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
					<TableRowGroup title="Nothing caught yet">
						<TableRow
							label="No ghost pings"
							subLabel="Messages that ping you and are then deleted will show up here."
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					{groupByOrigin(entries).map(group => (
						<View key={group.id ?? "@me"}>
							{/* Server header: icon plus name, so the origin reads at a glance. */}
							<View
								style={{
									flexDirection: "row",
									alignItems: "center",
									gap: 8,
									paddingHorizontal: 16,
									paddingBottom: 8,
								}}
							>
								<Avatar kind="guild" id={group.id} hash={group.icon} name={group.label} size={20} />
								<Text style={{ color: "#B5BAC1", fontSize: 12, fontWeight: "600" }}>
									{group.label.toUpperCase()}
								</Text>
							</View>

							<TableRowGroup>
								{group.items.map(entry => (
									<TableRow
										key={entry.id}
										icon={
											<Avatar
												kind="user"
												id={entry.authorId}
												hash={entry.authorAvatar}
												name={entry.authorName}
											/>
										}
										label={entry.authorName}
										subLabel={`${entry.content || "(no text)"}\n${REASON_LABEL[entry.reason]} in ${
											entry.channelName
										} · ${ago(entry.deletedAt)}`}
									/>
								))}
							</TableRowGroup>
						</View>
					))}

					<TableRowGroup title="Manage" hasIcons>
						<TableRow
							label="Clear log"
							subLabel={`Removes all ${entries.length} entries.`}
							icon={rowIcon("TrashIcon", "ic_trash")}
							onPress={() => storage?.set({ log: [] } as Partial<AntiGhostPingStorage>)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
