import { setSettings, useSettings } from "../../../lib/state"
import { SettingsPage } from "../../components/common"

export default function DisplaySettings() {
	const { TableRowGroup, TableSwitchRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="Activity">
				<TableSwitchRow
					label="Show as Listening"
					subLabel='Off shows "Playing" instead.'
					value={!!s.listeningTo}
					onValueChange={v => setSettings({ listeningTo: v })}
				/>
				<TableSwitchRow
					label="Show timestamps"
					subLabel="Adds a progress bar. Scrobble services don't report pause, so a paused track keeps advancing until it outlives its own length — turn this off if that bothers you."
					value={!!s.showTimestamp}
					onValueChange={v => setSettings({ showTimestamp: v })}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
