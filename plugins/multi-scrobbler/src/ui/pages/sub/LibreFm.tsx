import { useSettings } from "../../../lib/state"
import { SettingsPage, SettingsTextInput } from "../../components/common"

export default function LibreFmSettings() {
	const { TableRowGroup, TableRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="Libre.fm">
				<SettingsTextInput
					label="Username"
					settingsKey="librefmUsername"
					value={s.librefmUsername}
					placeholder="your Libre.fm username"
				/>
				<SettingsTextInput
					label="API key"
					settingsKey="librefmApiKey"
					value={s.librefmApiKey}
					placeholder="32-character key"
					secure
				/>
			</TableRowGroup>
			<TableRowGroup title="Note">
				<TableRow
					label="Slower polling"
					subLabel="Libre.fm asked for a one-minute minimum between checks, so the poll interval is floored at 60s for this service regardless of the Advanced setting."
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
