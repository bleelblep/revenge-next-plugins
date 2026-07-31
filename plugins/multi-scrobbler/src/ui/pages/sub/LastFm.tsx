import { useSettings } from "../../../lib/state"
import { SettingsPage, SettingsTextInput } from "../../components/common"

export default function LastFmSettings() {
	const { TableRowGroup, TableRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="Last.fm">
				<SettingsTextInput
					label="Username"
					settingsKey="username"
					value={s.username}
					placeholder="your Last.fm username"
				/>
				<SettingsTextInput
					label="API key"
					settingsKey="apiKey"
					value={s.apiKey}
					placeholder="32-character key"
					secure
				/>
			</TableRowGroup>
			<TableRowGroup title="Getting a key">
				<TableRow
					label="Create an API account"
					subLabel="last.fm/api/account/create — any application name works. Copy the API key, not the shared secret."
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
