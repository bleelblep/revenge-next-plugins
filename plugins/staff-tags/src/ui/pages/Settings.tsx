import type { StaffTagsStorage } from "../../index"

const { ScrollView } = revenge.react.ReactNative
const { TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<StaffTagsStorage>
}) {
	const { useRoleColor } = api.jsonStorage.use()

	return (
		<ScrollView style={{ flex: 1 }}>
			<TableRowGroup title="Tag style">
				<TableSwitchRow
					label="Use top role color for tag backgrounds"
					value={!!useRoleColor}
					onValueChange={value => api.jsonStorage.set({ useRoleColor: value })}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}
