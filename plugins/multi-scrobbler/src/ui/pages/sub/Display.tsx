import { setSettings, useSettings } from "../../../lib/state"
import { SettingsPage, SettingsTextInput } from "../../components/common"

export default function DisplaySettings() {
	const { TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design
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

			<TableRowGroup title="When playback stops">
				<SettingsTextInput
					label="Remove activity after (seconds)"
					settingsKey="expireAfterSeconds"
					value={s.expireAfterSeconds}
					placeholder="90"
				/>
				<TableRow
					label="Why this exists"
					subLabel="Scrobble services never report that you stopped — they just leave the last track marked as playing. Counted from when the track should have ended, so a song stopped early takes its remaining length plus this delay to disappear. Minimum 16s."
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
