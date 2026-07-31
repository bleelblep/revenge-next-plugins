import { DEFAULTS } from "../../index"
import { debugState } from "../../lib/debug"
import { SUPPORTED_SERVICES } from "../../services/ServiceFactory"
import Constants from "../../constants"
import type { LFMSettings, ServiceType } from "../../types"

/**
 * Stage 1: everything on one page. The original splits this across eight sub-pages, which is the
 * stage 2 plan -- see the port notes. Only the fields the core actually needs are here.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<LFMSettings>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, TextInput } = revenge.discord.design.Design

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<LFMSettings>) => api.jsonStorage.set(patch)

	const field = (
		label: string,
		key: keyof LFMSettings,
		placeholder: string,
		secure = false,
	) => (
		<TextInput
			label={label}
			value={String(s[key] ?? "")}
			placeholder={placeholder}
			secureTextEntry={secure}
			onChange={(value: string) => set({ [key]: value } as Partial<LFMSettings>)}
		/>
	)

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="Service">
						{SUPPORTED_SERVICES.map((service: ServiceType) => (
							<TableRow
								key={service}
								label={Constants.SERVICES[service].name}
								trailing={s.service === service ? "Selected" : undefined}
								onPress={() => set({ service })}
							/>
						))}
						{s.service ? (
							<TableRow label="Turn off scrobbling" onPress={() => set({ service: undefined })} />
						) : null}
					</TableRowGroup>

					{s.service === "lastfm" ? (
						<TableRowGroup title="Last.fm">
							{field("Username", "username", "your Last.fm username")}
							{field("API key", "apiKey", "from last.fm/api/account/create", true)}
						</TableRowGroup>
					) : null}

					{s.service === "librefm" ? (
						<TableRowGroup title="Libre.fm">
							{field("Username", "librefmUsername", "your Libre.fm username")}
							{field("API key", "librefmApiKey", "your Libre.fm API key", true)}
						</TableRowGroup>
					) : null}

					{s.service === "listenbrainz" ? (
						<TableRowGroup title="ListenBrainz">
							{field("Username", "listenbrainzUsername", "your ListenBrainz username")}
							{field("Token (optional)", "listenbrainzToken", "only needed for private data", true)}
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Display">
						{field("Activity name", "appName", "Music")}
						<TableSwitchRow
							label="Show as Listening"
							subLabel='Off shows "Playing" instead.'
							value={!!s.listeningTo}
							onValueChange={v => set({ listeningTo: v })}
						/>
						<TableSwitchRow
							label="Show timestamps"
							subLabel="Display elapsed time on the activity card."
							value={!!s.showTimestamp}
							onValueChange={v => set({ showTimestamp: v })}
						/>
						<TableSwitchRow
							label="Album art tooltip"
							subLabel="Show the album name when hovering the cover."
							value={!!s.showLargeText}
							onValueChange={v => set({ showLargeText: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Album art diagnostics">
						<TableRow label="Last track" subLabel={debugState.lastTrack ?? "nothing yet"} />
						<TableRow
							label="Art URL from service"
							subLabel={debugState.lastAlbumArtUrl ?? "nothing yet"}
						/>
						<TableRow
							label="Resolution stage"
							subLabel={debugState.lastAssetStage ?? "not attempted yet"}
						/>
						<TableRow label="Result" subLabel={debugState.lastAssetResult ?? "-"} />
						<TableRow
							label="Discord HTTP client"
							subLabel={debugState.httpUtilsResolved ? "resolved" : "MISSING"}
						/>
						<TableRow
							label="Polls / updates"
							subLabel={`${debugState.apiCalls} API calls, ${debugState.successfulUpdates} updates`}
						/>
						{debugState.lastError ? (
							<TableRow label="Last error" subLabel={debugState.lastError} />
						) : null}
					</TableRowGroup>

					<TableRowGroup title="Advanced">
						{field("Poll interval (seconds)", "timeInterval", "5")}
						<TableSwitchRow
							label="Verbose logging"
							subLabel="Log every request and parsed track to the debug console."
							value={!!s.verboseLogging}
							onValueChange={v => set({ verboseLogging: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
