import type { StaffTagsStorage } from "../../index"

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<StaffTagsStorage>
}) {
	// Resolved per-render, never at module top level. A plugin's whole bundle is evaluated
	// during preInit (revenge-bundle-next's createOptionsFactory runs the script through
	// `new Function`), long before Discord's design module exists. `revenge.discord.design.Design`
	// is a lazy proxy backed by lookupModule, and a full-scope miss calls cacheFilterNotFound()
	// on the *shared* 'revenge.discord.design.Design' key -- which permanently breaks Design for
	// Revenge's own settings UI too, not just this plugin, and gets flushed to the on-disk module
	// cache by the next unrelated write. That is what took out the whole Settings screen before.
	const { ScrollView } = revenge.react.ReactNative
	const { TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

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
