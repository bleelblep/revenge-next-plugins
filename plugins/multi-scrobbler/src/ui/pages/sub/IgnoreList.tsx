import { setSettings, useSettings } from "../../../lib/state"
import { SettingsPage } from "../../components/common"

/**
 * When any activity whose name contains one of these strings is already being broadcast, the
 * plugin clears its own activity and stops updating -- so a real game or another RPC plugin wins
 * rather than the two fighting over the profile.
 */
export default function IgnoreListSettings() {
	const { React } = revenge.react
	const { View } = revenge.react.ReactNative
	const { TableRowGroup, TableRow, TextInput, Button } = revenge.discord.design.Design

	const s = useSettings()
	const [draft, setDraft] = React.useState("")

	const entries = s.ignoreList ?? []

	const add = () => {
		const value = draft.trim()
		// Case-insensitive compare, because matching is case-insensitive too.
		if (!value || entries.some(e => e.toLowerCase() === value.toLowerCase())) return
		setSettings({ ignoreList: [...entries, value] })
		setDraft("")
	}

	const remove = (entry: string) => {
		setSettings({ ignoreList: entries.filter(e => e !== entry) })
	}

	return (
		<SettingsPage>
			<TableRowGroup title="Add an app">
				<TextInput
					label="Activity name"
					value={draft}
					placeholder="e.g. Spotify"
					onChange={setDraft}
				/>
				<View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
					<Button text="Add" variant="secondary" disabled={!draft.trim()} onPress={add} />
				</View>
			</TableRowGroup>

			<TableRowGroup title={entries.length ? `Ignoring ${entries.length}` : "Ignoring nothing"}>
				{entries.length ? (
					entries.map(entry => (
						<TableRow
							key={entry}
							label={entry}
							subLabel="Tap to remove"
							onPress={() => remove(entry)}
						/>
					))
				) : (
					<TableRow
						label="No apps ignored"
						subLabel="Add one above and this plugin will stay quiet whenever that app is broadcasting an activity."
					/>
				)}
			</TableRowGroup>

			<TableRowGroup title="How matching works">
				<TableRow
					label="Substring, case-insensitive"
					subLabel='"spotify" matches "Spotify" and "Spotify Premium". Keep entries short.'
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
