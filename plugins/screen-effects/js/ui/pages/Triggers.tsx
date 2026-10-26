import { FieldRow } from "../fieldGroup"
import { callNative } from "../../native"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { update, useSettings } from "../state"
import { TAP_LEVELS, tapLevel, tapLevelPatch } from "../tapLevel"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

function fake(kind: "send" | "receive") {
	callNative("trigger", [kind, true]).catch(error =>
		reportError(`[ScreenEffects] test ${kind} failed:`, error),
	)
}

/** When effects play, and how hard taps hit: the tap slider replaced the old on/off and Strength. */
export default function Triggers() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, Slider } = Design

	const s = useSettings()
	const bottom = useBottomPadding()
	const level = tapLevel(s)
	const current = TAP_LEVELS[level]

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup>
						<FieldRow label={`Tap effects — ${current.label}`}>
							<Text color="text-muted" variant="text-sm/normal">
								{current.subLabel}
							</Text>
							<Slider
								step={1}
								value={level}
								minimumValue={0}
								maximumValue={TAP_LEVELS.length - 1}
								onValueChange={(v: number) => {
									if (Math.round(v) !== level) update(tapLevelPatch(v))
								}}
							/>
							<View style={{ flexDirection: "row", justifyContent: "space-between" }}>
								{TAP_LEVELS.map((l, i) => (
									<Text
										key={l.label}
										color={i === level ? "text-default" : "text-muted"}
										variant={i === level ? "text-xs/semibold" : "text-xs/normal"}
									>
										{l.label}
									</Text>
								))}
							</View>
						</FieldRow>
					</TableRowGroup>

					<TableRowGroup title="Touches" hasIcons>
						<TableSwitchRow
							label="Charge on hold"
							subLabel="Holding grows a ring; letting go fires the effect, up to four times stronger after 1.2 seconds. Scrolling cancels it, so scrolls stay calm. Off: every tap plays straight away."
							icon={rowIcon("TimerIcon", "ClockIcon")}
							value={s.charge}
							disabled={!s.onTap}
							onValueChange={(charge: boolean) => update({ charge })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Messages" hasIcons>
						<TableSwitchRow
							label="When you send a message"
							subLabel="A stronger effect fires from the send button."
							icon={rowIcon("SendMessageIcon", "ChatIcon")}
							value={s.onSend}
							onValueChange={(onSend: boolean) => update({ onSend })}
						/>
						<TableSwitchRow
							label="When you're mentioned or DMed"
							subLabel="An effect fires from the top of the screen, at most once every 1.5 seconds."
							icon={rowIcon("BellIcon")}
							value={s.onReceive}
							onValueChange={(onReceive: boolean) => update({ onReceive })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Try them" description="These play even when the message switches are off." hasIcons>
						<TableRow
							label="Pretend I sent a message"
							subLabel="Fires from where you tap this row, as it would from the send button."
							icon={rowIcon("PlayIcon")}
							onPress={() => fake("send")}
						/>
						<TableRow
							label="Pretend someone mentioned me"
							subLabel="Fires from the top of the screen."
							icon={rowIcon("PlayIcon")}
							onPress={() => fake("receive")}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
