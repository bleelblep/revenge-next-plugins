import { DEFAULTS } from "../../defaults"
import { aliasCount, resetAliases } from "../../lib/alias"
import { diagnostics, resetDiagnostics } from "../../lib/diagnostics"
import { onEnabledChanged } from "../../lib/state"
import { refreshChat } from "../../lib/nudge"
import { probeNameModules } from "../../lib/probe"
import type { RedactionStyle, ScreenshotRedactorStorage } from "../../types"

// Read inside the component, never at module scope -- see docs/porting-rules.md rule 1.
function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: "ScreenshotRedactorToast", content })
}

/**
 * Reads as a sentence rather than a table because the useful signal is a comparison: rows seen
 * but never redacted means they reached the hook and were skipped; no rows at all from a
 * surface means that surface goes through a RowManager we never patched.
 */
function diagnosticsSummary(): string {
	const d = diagnostics()
	const skipped =
		d.skippedDisabled +
		d.skippedRowType +
		d.skippedNoRow +
		d.skippedNoMessage +
		d.skippedNoAuthor +
		d.skippedSelf

	const reasons = [
		d.skippedDisabled && `${d.skippedDisabled} off`,
		d.skippedRowType && `${d.skippedRowType} row type`,
		d.skippedNoRow && `${d.skippedNoRow} NO ROW (bug)`,
		d.skippedNoMessage && `${d.skippedNoMessage} no message`,
		d.skippedNoAuthor && `${d.skippedNoAuthor} no author`,
		d.skippedSelf && `${d.skippedSelf} you`,
	].filter(Boolean)

	return [
		`${d.rowManagersPatched} RowManager${d.rowManagersPatched === 1 ? "" : "s"} patched.`,
		`${d.rowsSeen} rows seen, ${d.rowsRedacted} redacted, ${skipped} skipped${reasons.length ? ` (${reasons.join(", ")})` : ""}.`,
		d.rowTypes.size ? `Row types seen: ${[...d.rowTypes].sort().join(", ")}.` : "No rows seen yet.",
		d.skippedRowTypeWithAuthor
			? `LEAK: ${d.skippedRowTypeWithAuthor} skipped rows had an author.`
			: "No skipped row carried an author.",
		`Deepest nesting: ${d.maxDepth}${d.maxDepth > 1 ? " (generate re-enters itself)" : ""}.`,
		d.avatarKeysSeen.size ? `Avatar fields found: ${[...d.avatarKeysSeen].join(", ")}.` : "No avatar field found yet.",
		d.namePatches.size
			? `Name resolvers patched: ${[...d.namePatches].join(", ")}.`
			: "No name resolver found — @mentions and the member list can't be redacted.",
		"DM header: not redacted (known limitation).",
		d.sheetHost ? `Sheet module patched: ${d.sheetHost}.` : "Sheet module not patched yet.",
		d.injectOutcome ? `Row insertion: ${d.injectOutcome}.` : "Row insertion not attempted yet.",
		d.sheetKeysSeen.size
			? `Action sheets seen: ${[...d.sheetKeysSeen].join(", ")}.`
			: "No action sheet opened yet.",
		d.sheetTypesSeen.size ? `Sheet contains: ${[...d.sheetTypesSeen].join(", ")}.` : "",
		d.overlayHost ? `Floating toggle mounted on ${d.overlayHost}.` : "Floating toggle found no host.",
	]
		.filter(Boolean)
		.join(" ")
}

const STYLE_LABELS: Array<{ value: RedactionStyle; label: string; subLabel: string }> = [
	{
		value: "pseudonym",
		label: "User 1, User 2…",
		subLabel: "Numbered in order of first appearance. The thread still reads as a conversation.",
	},
	{
		value: "initial",
		label: "U1, U2…",
		subLabel: "Same numbering, short enough not to reflow a narrow message header.",
	},
	{
		value: "block",
		label: "████████",
		subLabel: "Obviously redacted, but everyone on screen looks identical.",
	},
]

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<ScreenshotRedactorStorage>
}) {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { TableRowGroup, TableSwitchRow, TableRow, TableRadioGroup, TableRadioRow } =
		revenge.discord.design.Design

	const settings = api.jsonStorage.use() ?? DEFAULTS

	function setEnabled(enabled: boolean) {
		api.jsonStorage.set({ enabled })
		onEnabledChanged(enabled)

		const nudged = refreshChat()
		showToast(
			nudged
				? enabled
					? "Redaction on."
					: "Redaction off."
				: enabled
					? "Redaction on — reopen the channel if names are still showing."
					: "Redaction off — reopen the channel to restore names.",
		)
	}

	return (
		<Page>
			<ScrollView>
				<TableRowGroup title="Redaction">
					<TableSwitchRow
						label="Redact names and avatars"
						subLabel="Replaces every author in chat with a placeholder. Local only — nobody else sees any of this."
						value={!!settings.enabled}
						onValueChange={setEnabled}
					/>
					<TableRow
						label="⚠️ The DM header is not redacted"
						subLabel="In a DM or group DM the name at the top of the screen stays real. Messages, authors and avatars are redacted; the header is not. Crop it before sharing."
					/>
				</TableRowGroup>

				<TableRadioGroup
					title="Placeholder style"
					defaultValue={settings.style ?? DEFAULTS.style}
					onChange={(style: RedactionStyle) => api.jsonStorage.set({ style })}
				>
					{STYLE_LABELS.map(option => (
						<TableRadioRow key={option.value} label={option.label} subLabel={option.subLabel} value={option.value} />
					))}
				</TableRadioGroup>

				<TableRowGroup title="What gets covered">
					<TableSwitchRow
						label="Names everywhere, not just messages"
						subLabel="Also covers inline @mentions and the member list. ⚠️ The DM and group-DM header is NOT covered — it keeps showing the real name. Crop it out."
						value={!!settings.redactResolvedNames}
						onValueChange={redactResolvedNames => {
							api.jsonStorage.set({ redactResolvedNames })
							refreshChat()
						}}
					/>
					<TableSwitchRow
						label="Replace avatars"
						subLabel="Swaps in Discord's default avatars and drops avatar decorations and role icons."
						value={!!settings.redactAvatars}
						onValueChange={redactAvatars => api.jsonStorage.set({ redactAvatars })}
					/>
					<TableSwitchRow
						label="Redact me too"
						subLabel="Off by default — it's usually your screenshot, and leaving yourself visible makes the thread easier to follow."
						value={!!settings.redactSelf}
						onValueChange={redactSelf => api.jsonStorage.set({ redactSelf })}
					/>
				</TableRowGroup>

				<TableRowGroup title="Quick toggle">
					<TableSwitchRow
						label="Add a row to the message menu"
						subLabel="Long-press any message to hide or show names. Out of sight until you ask for it, so it can't end up in the screenshot."
						value={!!settings.showSheetToggle}
						onValueChange={showSheetToggle => api.jsonStorage.set({ showSheetToggle })}
					/>
					<TableSwitchRow
						label="Floating button over the chat"
						subLabel="A round eye button above the composer instead. Off by default: it sits in the corner of every shot, so it hides itself for 8 seconds after you arm it — a workaround for being in the wrong place."
						value={!!settings.showOverlayToggle}
						onValueChange={showOverlayToggle => api.jsonStorage.set({ showOverlayToggle })}
					/>
				</TableRowGroup>

				<TableRowGroup title="Numbering">
					<TableSwitchRow
						label="Restart numbering each time"
						subLabel="Start again from User 1 whenever redaction is switched on, so numbers can't be matched up between two screenshots."
						value={!!settings.resetNumberingOnEnable}
						onValueChange={resetNumberingOnEnable => api.jsonStorage.set({ resetNumberingOnEnable })}
					/>
					<TableRow
						label="Reset numbering now"
						subLabel={`${aliasCount()} ${aliasCount() === 1 ? "person has" : "people have"} been assigned a placeholder.`}
						onPress={() => {
							resetAliases()
							refreshChat()
							showToast("Numbering reset.")
						}}
					/>
				</TableRowGroup>

				<TableRowGroup title="Debug">
					<TableSwitchRow
						label="Verbose logging"
						subLabel="Prints message-row field names and channel-title hook detail to the log (adb logcat -s ReactNativeJS). Shapes and key names only — never a name, id or URL."
						value={!!settings.verboseLogging}
						onValueChange={verboseLogging => api.jsonStorage.set({ verboseLogging })}
					/>
					<TableRow
						label="Probe name modules"
						subLabel="Sweeps Metro for anything that resolves a name or title and prints it to the log (adb logcat -s ReactNativeJS). Module ids and key names only — never a value."
						onPress={() => {
							try {
								showToast(probeNameModules())
							} catch (error) {
								console.error("[ScreenshotRedactor] probe failed:", error)
								showToast("Probe failed — see the log.")
							}
						}}
					/>
					<TableRow label="Diagnostics" subLabel={diagnosticsSummary()} />
					<TableRow
						label="Reset diagnostics"
						subLabel="Zero the counters, then open the surface that isn't working and come back."
						onPress={() => {
							resetDiagnostics()
							showToast("Diagnostics reset.")
						}}
					/>
				</TableRowGroup>
			</ScrollView>
		</Page>
	)
}
