import { setSettings, useSettings } from "../../../lib/state"
import { SettingsPage } from "../../components/common"

export default function LoggingSettings() {
	const { TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="Logging">
				<TableSwitchRow
					label="Verbose logging"
					subLabel="Log every API request and parsed track."
					value={!!s.verboseLogging}
					onValueChange={v => setSettings({ verboseLogging: v })}
				/>
			</TableRowGroup>
			<TableRowGroup title="Where the output goes">
				<TableRow
					label="Debugger only"
					subLabel="These go to the debug console, not to the app. If you can't attach a debugger, the Diagnostics page shows the same state without one."
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
