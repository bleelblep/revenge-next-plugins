import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import type { AntiGhostPingStorage } from "../../types"

/** Every toggle, on its own route so the root page stays a two-row index. */
export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design

	// Rendered as a plain navigator route, so there's no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AntiGhostPingStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="What counts as a ping">
						<TableSwitchRow
							label="Direct mentions"
							subLabel="Someone @'d you by name."
							value={!!s.catchDirect}
							onValueChange={v => set({ catchDirect: v })}
						/>
						<TableSwitchRow
							label="Replies"
							subLabel="Someone replied to your message."
							value={!!s.catchReplies}
							onValueChange={v => set({ catchReplies: v })}
						/>
						<TableSwitchRow
							label="@everyone and @here"
							subLabel="Noisy on big servers — off by default."
							value={!!s.catchEveryone}
							onValueChange={v => set({ catchEveryone: v })}
						/>
						<TableSwitchRow
							label="Role pings"
							subLabel="Any role mention, whether or not you hold the role — the message cache doesn't reliably say. Off by default."
							value={!!s.catchRoles}
							onValueChange={v => set({ catchRoles: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications">
						<TableSwitchRow
							label="Toast when caught"
							subLabel="Show a toast the moment a ghost ping is detected."
							value={!!s.toastOnCatch}
							onValueChange={v => set({ toastOnCatch: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Testing">
						<TableSwitchRow
							label="Count my own messages"
							subLabel="Lets you verify the plugin by pinging yourself and deleting it. Not a real ghost ping — leave this off once you've confirmed it works."
							value={!!s.countOwnMessages}
							onValueChange={v => set({ countOwnMessages: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Limitation">
						<TableRow
							label="Only messages Discord had loaded"
							subLabel="Detection reads Discord's own message cache. A ping deleted in a channel you never opened was never cached, so it can't be caught."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
