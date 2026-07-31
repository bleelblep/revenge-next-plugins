import { useSettings } from "../../../lib/state"
import { SettingsPage, SettingsTextInput } from "../../components/common"

export default function ListenBrainzSettings() {
	const { TableRowGroup, TableRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="ListenBrainz">
				<SettingsTextInput
					label="Username"
					settingsKey="listenbrainzUsername"
					value={s.listenbrainzUsername}
					placeholder="your ListenBrainz username"
				/>
				<SettingsTextInput
					label="Token"
					settingsKey="listenbrainzToken"
					value={s.listenbrainzToken}
					placeholder="optional"
					secure
				/>
			</TableRowGroup>
			<TableRowGroup title="About the token">
				<TableRow
					label="Usually not needed"
					subLabel="Listens are public by default, so a username alone is enough. Add a token only if your listens are private — get one from listenbrainz.org/settings."
				/>
				<TableRow
					label="Album art"
					subLabel="Covers come from the Cover Art Archive via the recording's MusicBrainz id, so tracks without one show no art."
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
