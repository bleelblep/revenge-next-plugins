import { DEFAULTS } from "../../defaults"
import { describeBackupPath } from "../../lib/backup"
import { makeFakeDeletedMessages } from "../../lib/debug"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"

export default function Debug() {
	const { Page } = revenge.components
	const { ScrollView, Alert } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const resolvedPath = describeBackupPath(s.backupFilePath)

	const seedFake = () => {
		if (!storage) return
		Alert.alert(
			"Fill with fake deleted messages",
			"This will replace your current deleted-messages log with 200 fake entries for UI testing.",
			[
				{ text: "Cancel", style: "cancel" },
				{
					text: "Fill 200",
					style: "destructive",
					onPress: () => {
						void storage.set({ log: makeFakeDeletedMessages(200) })
						revenge.discord.actions.ToastActionCreators.open({
							key: "ghost-log:seed-200",
							content: "Loaded 200 fake deleted messages.",
						})
					},
				},
			],
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Debug" hasIcons>
						<TableSwitchRow
							label="Count my own messages"
							subLabel="For testing only: lets you delete your own message and verify capture."
							icon={rowIcon("UserIcon")}
							value={!!s.countOwnMessages}
							onValueChange={countOwnMessages => storage?.set({ countOwnMessages })}
						/>
						<TableRow
							label="Resolved backup target path"
							subLabel={resolvedPath}
							icon={rowIcon("PinIcon", "ic_pin")}
						/>
						<TableRow
							label="Fill log with 200 fake entries"
							subLabel="For UI testing: multiple servers, users, channels and attachments. Replaces current log."
							icon={rowIcon("BugIcon", "ic_debug")}
							onPress={seedFake}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
