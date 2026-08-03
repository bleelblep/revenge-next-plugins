import { DEFAULTS } from "../../defaults"
import { getStorage } from "../../lib/state"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"

export default function Debug() {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Debug" hasIcons>
						<TableSwitchRow
							label="Count my own messages"
							subLabel="For testing only: lets you verify catches by pinging yourself and deleting it."
							icon={rowIcon("UserIcon")}
							value={!!s.countOwnMessages}
							onValueChange={countOwnMessages => storage?.set({ countOwnMessages })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
