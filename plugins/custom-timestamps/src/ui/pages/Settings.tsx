import type { ReactElement } from "react"
import renderTimestamp, { type Mode, type TimestampStorage } from "../../lib/renderTimestamp"
import { CustomTimeInputRow } from "../components/CustomTimeInputRow"
import { SelectableRow } from "../components/SelectableRow"

const { ScrollView } = revenge.react.ReactNative
const { TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

interface ModeOption {
	label: string
	key: Mode
	renderExtra?: (selected: boolean) => ReactElement
}

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<TimestampStorage>
}) {
	const { selected, customFormat, separateMessages } = api.jsonStorage.use()

	const modes: ModeOption[] = [
		{ label: "Calendar", key: "calendar" },
		{ label: "Relative", key: "relative" },
		{ label: "ISO 8601", key: "iso" },
		{
			label: "Custom",
			key: "custom",
			renderExtra: selectedNow => (
				<CustomTimeInputRow
					value={customFormat}
					onChangeText={text => api.jsonStorage.set({ customFormat: text })}
					placeholder="dddd, MMMM Do YYYY, h:mm:ss a"
					disabled={!selectedNow}
				/>
			),
		},
	]

	return (
		<ScrollView>
			<TableRowGroup title="Mode">
				{modes.map(({ label, key, renderExtra }) => (
					<>
						<SelectableRow
							key={key}
							label={label}
							subLabel={renderTimestamp(new Date(), key, customFormat)}
							selected={selected === key}
							onPress={() => api.jsonStorage.set({ selected: key })}
						/>
						{renderExtra?.(selected === key)}
					</>
				))}
			</TableRowGroup>
			<TableRowGroup>
				<TableSwitchRow
					label="Separate messages"
					subLabel="Always shows username, avatar and timestamp for each message"
					value={!!separateMessages}
					onValueChange={value => api.jsonStorage.set({ separateMessages: value })}
				/>
			</TableRowGroup>
		</ScrollView>
	)
}
