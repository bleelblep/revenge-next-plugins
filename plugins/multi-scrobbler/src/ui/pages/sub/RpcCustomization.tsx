import { setSettings, useSettings } from "../../../lib/state"
import { SettingsPage, SettingsTextInput } from "../../components/common"

export default function RpcCustomizationSettings() {
	const { TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design
	const s = useSettings()

	return (
		<SettingsPage>
			<TableRowGroup title="Activity name">
				<SettingsTextInput
					label="Name"
					settingsKey="appName"
					value={s.appName}
					placeholder="Music"
				/>
				<TableRow
					label="Placeholders"
					subLabel="{{artist}}, {{name}}, {{album}} and {{service}} are substituted per track. Leave plain text for a fixed name."
				/>
			</TableRowGroup>

			<TableRowGroup title="Album art tooltip">
				<TableSwitchRow
					label="Show tooltip"
					subLabel="Text shown when hovering the cover. Needs album art to be resolved."
					value={!!s.showLargeText}
					onValueChange={v => setSettings({ showLargeText: v })}
				/>
				<TableSwitchRow
					label="Include album name"
					subLabel='Adds "on <album>".'
					value={!!s.showAlbumInTooltip}
					onValueChange={v => setSettings({ showAlbumInTooltip: v })}
				/>
				<TableSwitchRow
					label="Include track length"
					subLabel="Adds the duration, when the service reports one."
					value={!!s.showDurationInTooltip}
					onValueChange={v => setSettings({ showDurationInTooltip: v })}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
