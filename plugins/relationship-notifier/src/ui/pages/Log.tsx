import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { EventKind, RelationshipEvent, RelationshipNotifierStorage } from "../../types"
import Avatar from "../components/Avatar"

const HEADING: Record<EventKind, string> = {
	friend: "Friends lost",
	guild: "Servers left",
	groupdm: "Group DMs closed",
}

const DESCRIPTION: Record<EventKind, string> = {
	friend: "no longer a friend",
	guild: "no longer in this server",
	groupdm: "group closed",
}

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return "just now"
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

export default function Log() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
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
					<TableRowGroup title="Nothing yet">
						<TableRow
							label="No changes recorded"
							subLabel="Lost friends, servers and group DMs will appear here."
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	}

	// Grouped by kind rather than by time: losing a friend and leaving a server are different
	// things, and mixing them chronologically makes the list harder to read, not easier.
	const kinds: EventKind[] = ["friend", "guild", "groupdm"]
	const grouped = kinds
		.map(kind => [kind, entries.filter(e => e.kind === kind)] as [EventKind, RelationshipEvent[]])
		.filter(([, items]) => items.length)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					{grouped.map(([kind, items]) => (
						<TableRowGroup key={kind} title={`${HEADING[kind]} (${items.length})`}>
							{items.map(entry => (
								<TableRow
									key={entry.id}
									icon={
										<Avatar
											kind={entry.kind === "friend" ? "user" : "guild"}
											id={entry.targetId}
											hash={entry.iconHash}
											name={entry.name}
										/>
									}
									label={entry.name}
									subLabel={`${DESCRIPTION[entry.kind]} · ${ago(entry.at)}`}
								/>
							))}
						</TableRowGroup>
					))}

					<TableRowGroup title="Manage" hasIcons>
						<TableRow
							label="Clear history"
							subLabel={`Removes all ${entries.length} entries.`}
							icon={rowIcon("TrashIcon", "ic_trash")}
							onPress={() => storage?.set({ log: [] } as Partial<RelationshipNotifierStorage>)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
