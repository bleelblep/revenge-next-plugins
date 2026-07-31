import Constants from "../../constants"
import { SUPPORTED_SERVICES } from "../../services/ServiceFactory"
import type { LFMSettings, ServiceType } from "../../types"
import { SettingsPage } from "../components/common"
import { SUB_PAGES } from "../routes"

/**
 * Root settings page: pick a service, then jump to a sub-page. Service pages are filtered to
 * whichever service is selected, so you never see credential fields the plugin isn't reading.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<LFMSettings>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { TableRowGroup, TableRow, TableRadioGroup, TableRadioRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...Constants.DEFAULT_SETTINGS, ...(api.jsonStorage.use() ?? {}) }

	const pages = SUB_PAGES.filter(page => !page.onlyForService || page.onlyForService === s.service)

	return (
		<SettingsPage>
			<TableRadioGroup
				title="Service"
				defaultValue={s.service}
				onChange={(service: ServiceType) => api.jsonStorage.set({ service })}
			>
				{SUPPORTED_SERVICES.map((service: ServiceType) => (
					<TableRadioRow key={service} label={Constants.SERVICES[service].name} value={service} />
				))}
			</TableRadioGroup>

			<TableRowGroup title="Scrobbling">
				{s.service ? (
					<TableRow
						label="Turn off scrobbling"
						subLabel="Clears the activity and stops polling."
						onPress={() => api.jsonStorage.set({ service: undefined })}
					/>
				) : (
					<TableRow label="No service selected" subLabel="Pick one above to start scrobbling." />
				)}
			</TableRowGroup>

			<TableRowGroup title="Settings">
				{pages.map(page => (
					<TableRow
						key={page.key}
						label={page.title}
						subLabel={page.subtitle}
						arrow
						onPress={() => navigation.navigate(page.route)}
					/>
				))}
			</TableRowGroup>

			<TableRowGroup title="Advanced">
				<TableRow
					label="Poll interval"
					subLabel={`${s.timeInterval}s${s.service === "librefm" ? " (Libre.fm is floored at 60s)" : ""}`}
				/>
			</TableRowGroup>
		</SettingsPage>
	)
}
