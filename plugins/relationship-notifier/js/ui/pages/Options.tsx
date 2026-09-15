import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { RelationshipNotifierStorage } from "../../types"

/** Every toggle, on its own route so the root page stays an index. */
export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<RelationshipNotifierStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Watch for" hasIcons>
						<TableSwitchRow
							label="Friend removals"
							subLabel="Someone is no longer in your friends list."
							icon={rowIcon("UserMinusIcon")}
							value={!!s.watchFriends}
							onValueChange={v => set({ watchFriends: v })}
						/>
						<TableSwitchRow
							label="Servers"
							subLabel="You're no longer in a server you shared with people."
							icon={rowIcon("ServerIcon")}
							value={!!s.watchGuilds}
							onValueChange={v => set({ watchGuilds: v })}
						/>
						<TableSwitchRow
							label="Group DMs"
							subLabel="A group DM you were in was closed or you were removed."
							icon={rowIcon("GroupIcon")}
							value={!!s.watchGroupDms}
							onValueChange={v => set({ watchGroupDms: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="Toast when it happens"
							subLabel="Show a toast at the moment of the change, not just in the history."
							icon={rowIcon("BellIcon")}
							value={!!s.toastOnEvent}
							onValueChange={v => set({ toastOnEvent: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
