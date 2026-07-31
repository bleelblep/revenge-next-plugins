import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import type { RelationshipNotifierStorage } from "../../types"

export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<RelationshipNotifierStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Watch for">
						<TableSwitchRow
							label="Friend removals"
							subLabel="Someone is no longer in your friends list."
							value={!!s.watchFriends}
							onValueChange={v => set({ watchFriends: v })}
						/>
						<TableSwitchRow
							label="Servers"
							subLabel="You're no longer in a server you shared with people."
							value={!!s.watchGuilds}
							onValueChange={v => set({ watchGuilds: v })}
						/>
						<TableSwitchRow
							label="Group DMs"
							subLabel="A group DM you were in was closed or you were removed."
							value={!!s.watchGroupDms}
							onValueChange={v => set({ watchGroupDms: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications">
						<TableSwitchRow
							label="Toast when it happens"
							subLabel="Show a toast at the moment of the change, not just in the history."
							value={!!s.toastOnEvent}
							onValueChange={v => set({ toastOnEvent: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Worth knowing">
						<TableRow
							label="It can't tell who did it"
							subLabel="Discord sends the same event whether they removed you or you removed them, so your own actions get recorded too. Same for leaving a server yourself."
						/>
						<TableRow
							label="Server outages are ignored"
							subLabel="Discord marks those separately, so a server going down briefly won't be recorded as leaving it."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
