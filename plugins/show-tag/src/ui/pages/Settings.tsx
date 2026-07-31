import { DEFAULTS, type ShowTagStorage } from "../../index"

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<ShowTagStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	const { onlyUsername } = api.jsonStorage.use() ?? DEFAULTS

	return (
		<Page>
			<ScrollView>
				<TableRowGroup title="Display">
					<TableSwitchRow
						label="Only show usernames"
						subLabel="Replace the display name with the username instead of appending it."
						value={!!onlyUsername}
						onValueChange={value => api.jsonStorage.set({ onlyUsername: value })}
					/>
				</TableRowGroup>
			</ScrollView>
		</Page>
	)
}
