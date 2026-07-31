import { debugState } from "../../../lib/debug"
import { getStatus } from "../../../manager"
import { SettingsPage } from "../../components/common"

/**
 * Stands in for the original's Debug page. Everything here exists because there's no guarantee of
 * a debugger being attached -- these are the values that actually located the two album-art bugs.
 */
export default function DiagnosticsPage() {
	const { TableRowGroup, TableRow } = revenge.discord.design.Design
	const status = getStatus()

	return (
		<SettingsPage>
			<TableRowGroup title="Status">
				<TableRow label="Running" subLabel={status.running ? "yes" : "no"} />
				<TableRow label="Service" subLabel={status.service ?? "none selected"} />
				<TableRow label="Polling" subLabel={status.polling ? "active" : "stopped"} />
				{status.isReconnecting ? (
					<TableRow label="Reconnecting" subLabel={`${status.consecutiveFailures} consecutive failures`} />
				) : null}
			</TableRowGroup>

			<TableRowGroup title="Last track">
				<TableRow label="Track" subLabel={debugState.lastTrack ?? "nothing yet"} />
				<TableRow label="Album art URL" subLabel={debugState.lastAlbumArtUrl ?? "nothing yet"} />
			</TableRowGroup>

			<TableRowGroup title="Album art resolution">
				<TableRow label="Stage" subLabel={debugState.lastAssetStage ?? "not attempted yet"} />
				<TableRow label="Result" subLabel={debugState.lastAssetResult ?? "-"} />
				<TableRow
					label="Discord HTTP client"
					subLabel={debugState.httpUtilsResolved ? "resolved" : "MISSING"}
				/>
			</TableRowGroup>

			<TableRowGroup title="Counters">
				<TableRow label="API calls" subLabel={String(debugState.apiCalls)} />
				<TableRow label="Successful updates" subLabel={String(debugState.successfulUpdates)} />
				{debugState.lastError ? (
					<TableRow
						label="Last error"
						subLabel={`${debugState.lastErrorService ?? "?"}: ${debugState.lastError}`}
					/>
				) : null}
			</TableRowGroup>
		</SettingsPage>
	)
}
