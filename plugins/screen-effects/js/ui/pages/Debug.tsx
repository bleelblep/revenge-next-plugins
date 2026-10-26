import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { update, useNative, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/**
 * Renderer switches and capture timings, kept off the root page. Legacy distortions are on by
 * default; this is where they can be turned off. Force legacy only shows on Android 13+, where it
 * does something.
 */
export default function Debug() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()
	const modernPhone = (native?.apiLevel ?? 0) >= 33
	const legacy = native ? !native.supported : false
	const diagnostics = native?.rippleDiagnostics

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup
						title="Renderer"
						description={
							native
								? `Android API ${native.apiLevel} · ${legacy ? "Legacy renderer" : "Modern renderer"}${native.hardwareAccelerated === false ? " · window not hardware accelerated" : ""}`
								: "Checking renderer…"
						}
						hasIcons
					>
						{modernPhone ? (
							<TableSwitchRow
								label="Force legacy rendering"
								subLabel="Use the Android 12-and-lower path on this phone, for testing. Applies immediately and stays on after restart."
								icon={rowIcon("SettingsIcon", "ic_settings")}
								value={s.forceLegacy}
								onValueChange={(forceLegacy: boolean) => update({ forceLegacy })}
							/>
						) : null}
						<TableSwitchRow
							label="Legacy distortions"
							subLabel={`Bends the screen in legacy mode from a live capture of the window, drawn with OpenGL ES. Off: only Shockwave and both inks play, as flat overlays.${legacy ? "" : " Not used by the modern renderer."}`}
							icon={rowIcon("WaveformIcon", "ScreenIcon")}
							value={s.legacyRipple}
							onValueChange={(legacyRipple: boolean) => update({ legacyRipple })}
						/>
					</TableRowGroup>

					{legacy && s.legacyRipple && diagnostics ? (
						<TableRowGroup title="Capture">
							<TableRow label="Status" subLabel={diagnostics.status} />
							<TableRow
								label="Frames"
								subLabel={`${diagnostics.frames} draws / ${diagnostics.captures ?? 0} captures · ${diagnostics.imageSize || "No capture yet"}`}
							/>
							<TableRow
								label="Timings"
								subLabel={`Capture avg ${(diagnostics.averageCaptureMs ?? 0).toFixed(1)} ms / peak ${(diagnostics.peakCaptureMs ?? 0).toFixed(1)} ms · draw ${diagnostics.renderMs.toFixed(1)} ms · capture/upload ${diagnostics.totalMs.toFixed(1)} ms · interval ${diagnostics.captureIntervalMs ?? 50} ms`}
							/>
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
