import { DEFAULTS } from "../../defaults"
import { decryptMessageText } from "../../lib/backup"
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
	const { React } = revenge.react
	const { ScrollView, View, Text, Alert, Pressable } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, Card } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries = s.log ?? []
	const pageSize = 50
	const totalPages = Math.max(1, Math.ceil(entries.length / pageSize))
	const [page, setPage] = React.useState(1)
	const safePage = Math.min(Math.max(1, page), totalPages)
	const start = (safePage - 1) * pageSize
	const end = start + pageSize
	const pagedEntries = entries.slice(start, end)
	const grouped = groupByOrigin(pagedEntries)
	// Hook-based, so called unconditionally above either return branch.
	const bottomPadding = useBottomPadding()

	const clearLog = () => {
		if (!storage) return
		Alert.alert("Clear log", `Remove all ${entries.length} deleted-message entries?`, [
			{ text: "Cancel", style: "cancel" },
			{ text: "Clear", style: "destructive", onPress: () => storage?.set({ log: [] } as Partial<GhostLogStorage>) },
		])
	}

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
					{totalPages > 1 ? (
						<Card variant="secondary" border="none">
							<View style={{ flexDirection: "row", padding: 10, gap: 8 }}>
								<Pressable
									onPress={() => safePage > 1 && setPage(safePage - 1)}
									disabled={safePage <= 1}
									style={{
										flex: 1,
										minHeight: 38,
										borderRadius: 12,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: safePage <= 1 ? "#23262b" : "#2b2f36",
									}}
								>
									<Text style={{ color: safePage <= 1 ? "#6b7280" : "#d7dce2", fontWeight: "700" }}>
										Prev
									</Text>
								</Pressable>

								<View
									style={{
										flex: 1,
										minHeight: 38,
										borderRadius: 12,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: "#2b2f36",
										borderWidth: 1,
										borderColor: "#3a3f47",
									}}
								>
									<Text style={{ color: "#d7dce2", fontWeight: "700" }}>{`Page ${safePage}/${totalPages}`}</Text>
								</View>

								<Pressable
									onPress={() => safePage < totalPages && setPage(safePage + 1)}
									disabled={safePage >= totalPages}
									style={{
										flex: 1,
										minHeight: 38,
										borderRadius: 12,
										alignItems: "center",
										justifyContent: "center",
										backgroundColor: safePage >= totalPages ? "#23262b" : "#2b2f36",
									}}
								>
									<Text style={{ color: safePage >= totalPages ? "#6b7280" : "#d7dce2", fontWeight: "700" }}>
										Next
									</Text>
								</Pressable>
							</View>
						</Card>
					) : null}

					{grouped.map(group => (
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
								{group.items.map(entry => {
									const body = decryptMessageText(entry.content)
									const attachments = entry.attachments?.length
										? ` [${entry.attachments.length} attachment${entry.attachments.length > 1 ? "s" : ""}]`
										: ""
									const preview = (body || "(no text)").slice(0, 280)

									return (
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
											subLabel={`${preview}${attachments}\n${entry.channelName} · ${ago(entry.deletedAt)}`}
										/>
									)
								})}
							</TableRowGroup>
						</View>
					))}

					<TableRowGroup title="Manage" hasIcons>
						<TableRow
							label="Clear log"
							subLabel={`Removes all ${entries.length} entries.`}
							icon={rowIcon("TrashIcon", "ic_trash")}
							onPress={clearLog}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
