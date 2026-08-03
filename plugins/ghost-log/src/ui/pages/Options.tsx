import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { GhostLogStorage } from "../../types"

export default function Options() {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<GhostLogStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Log deletions"
							subLabel="Save deleted message text to persistent storage."
							icon={rowIcon("PencilIcon", "ic_edit")}
							value={!!s.logDeletions}
							onValueChange={v => set({ logDeletions: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="Toast when caught"
							subLabel="Show a toast the moment a deletion is detected."
							icon={rowIcon("BellIcon", "ic_notification")}
							value={!!s.toastOnCatch}
							onValueChange={v => set({ toastOnCatch: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Limits" hasIcons>
						<TableSwitchRow
							label="Encrypted auto backup"
							subLabel={
								s.backupEnabled
									? "On - each new catch also updates an encrypted backup file."
									: "Off - deleted messages stay in plugin storage only."
							}
							icon={rowIcon("LockIcon", "ic_lock")}
							value={!!s.backupEnabled}
							onValueChange={v => set({ backupEnabled: v })}
						/>
						<TableSwitchRow
							label="Unlimited entries"
							subLabel={
								s.unlimitedEntries
									? "Keeping every caught message."
									: `Off — only the newest ${s.maxEntries ?? DEFAULTS.maxEntries} entries are kept, oldest are dropped when full.`
							}
							icon={rowIcon("InfinityIcon", "ListBulletsIcon", "ListViewIcon")}
							value={!!s.unlimitedEntries}
							onValueChange={v => set({ unlimitedEntries: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
