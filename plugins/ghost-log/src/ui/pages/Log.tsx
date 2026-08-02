import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { GhostLogStorage, DeletedMessage } from "../../types"
import Avatar from "../components/Avatar"

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return "just now"
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

function groupByOrigin(entries: DeletedMessage[]) {
	const groups = new Map<string, { label: string; icon?: string; id?: string; items: DeletedMessage[] }>()

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
	const { Page } = revenge.components
	const { ScrollView, View, Text } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

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
							label="No deleted messages"
							subLabel="Deleted messages will show up here as they are caught."
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
										subLabel={`${entry.content || "(no text)"}${entry.attachments?.length ? ` [${entry.attachments.length} attachment${entry.attachments.length > 1 ? "s" : ""}]` : ""}\n${entry.channelName} · ${ago(entry.deletedAt)}`}
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
							onPress={() => storage?.set({ log: [] } as Partial<GhostLogStorage>)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
