import { FieldRow } from "../fieldGroup"
import type { EffectStyle } from "../../native"
import { EFFECT_OPTIONS, availableOptions, savedUnavailable } from "../options"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { TestPad } from "../testPad"
import { update, useNative, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

export default function Effect() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, Slider } = Design

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()
	const unsupported = native ? !native.supported : false
	const options = availableOptions(EFFECT_OPTIONS, native, "effects")
	// Capture bends one window at a time, so "every window" means nothing then; flat overlays
	// never bend, so colour fringing has nothing to split.
	const capturing = unsupported && s.legacyRipple
	const overlaysOnly = unsupported && !s.legacyRipple

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TestPad />
					<TableRadioGroup
						key={`${native?.rendererTier}:${options.map(o => o.value).join(",")}`}
						title="Screen effect"
						description={
							savedUnavailable(native, "effects", s.style) ?? (unsupported
								? s.legacyRipple
									? "Legacy mode: effects bend a live capture of one window, so they look a little soft. Combine with particles, or pick None to use particles alone."
									: "Legacy overlays only (Legacy distortions are off in Debug): shockwave, ink and ink (B&W). Combine with particles."
								: "Distort the screen from your tap. Combine with particles, or pick None to use particles alone."
							)
						}
						defaultValue={s.style}
						onChange={(style: EffectStyle) => update({ style })}
					>
						{options.map(option => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								value={option.value}
							/>
						))}
					</TableRadioGroup>

					{!overlaysOnly && s.style !== "none" ? (
						<TableRowGroup>
							<FieldRow label={`Colour fringing — ${s.dose === 0 ? "off" : s.dose.toFixed(1)}`}>
								<Text color="text-muted" variant="text-sm/normal">
									Splits red and blue apart wherever the screen bends, like a cheap lens. Glitch always
									tears the colours a little; this adds more. How hard it bends is set by Tap effects in
									When effects play.
								</Text>
								<Slider
									step={0.1}
									value={s.dose}
									minimumValue={0}
									maximumValue={3}
									onValueChange={(v: number) => update({ dose: Math.round(v * 10) / 10 })}
								/>
							</FieldRow>
						</TableRowGroup>
					) : null}

					{!capturing && s.style !== "none" ? (
						<TableRowGroup hasIcons>
							<TableSwitchRow
								label="Bend every window"
								subLabel="Menus, dialogs and the screen behind them bend together. Off bends only the window you touched, which is lighter on the GPU. Particles always stay in the window you touched."
								icon={rowIcon("WindowLaunchIcon", "ScreenIcon")}
								value={s.allWindows}
								onValueChange={(allWindows: boolean) => update({ allWindows })}
							/>
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
