import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import type { AntiGhostPingStorage } from "../../types"

/** Every toggle, on its own route so the root page stays an index. */
export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	// Rendered as a plain navigator route, so there's no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AntiGhostPingStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="What counts as a ping" hasIcons>
						<TableSwitchRow
							label="Direct mentions"
							subLabel="Someone @'d you by name."
							icon={rowIcon("AtIcon")}
							value={!!s.catchDirect}
							onValueChange={v => set({ catchDirect: v })}
						/>
						<TableSwitchRow
							label="Replies"
							subLabel="Someone replied to your message."
							icon={rowIcon("ArrowAngleLeftUpIcon")}
							value={!!s.catchReplies}
							onValueChange={v => set({ catchReplies: v })}
						/>
						<TableSwitchRow
							label="@everyone and @here"
							subLabel="Noisy on big servers — off by default."
							icon={rowIcon("AnnouncementsIcon")}
							value={!!s.catchEveryone}
							onValueChange={v => set({ catchEveryone: v })}
						/>
						<TableSwitchRow
							label="Role pings"
							subLabel="Any role mention, whether or not you hold the role — the message cache doesn't reliably say. Off by default."
							icon={rowIcon("TagsIcon")}
							value={!!s.catchRoles}
							onValueChange={v => set({ catchRoles: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="Toast when caught"
							subLabel="Show a toast the moment a ghost ping is detected."
							icon={rowIcon("BellIcon")}
							value={!!s.toastOnCatch}
							onValueChange={v => set({ toastOnCatch: v })}
						/>
					</TableRowGroup>

				</Stack>
			</ScrollView>
		</Page>
	)
}
