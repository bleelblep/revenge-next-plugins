import { MESSAGE_EFFECTS, OFFERED_MESSAGE_EFFECTS } from "../../lib/messageEffects"
import { getRoundTrip, onRoundTrip } from "../../triggers"
import { callNative } from "../../native"
import { rowIcon } from "../icon"
import { useBottomPadding } from "../safeArea"
import { update, useSettings, useNative } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

function preview(effect: string) {
	callNative("messageEffect", [effect, true]).catch(error =>
		reportError(`[ScreenEffects] preview ${effect} failed:`, error),
	)
}

export default function MessageEffects() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } = Design

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()
	const [roundTrip, setRoundTrip] = React.useState(getRoundTrip())
	React.useEffect(() => onRoundTrip(setRoundTrip), [])

	const label = (value: string) => MESSAGE_EFFECTS.find(e => e.value === value)?.label ?? value
	const check = !roundTrip
		? {
				label: "Not checked yet",
				subLabel: "Send any /fx message, even in a channel only you can see. The result shows here.",
			}
		: roundTrip.survived
			? {
					label: `Works: your ${label(roundTrip.effect)} came back intact`,
					subLabel: "Discord kept the hidden effect, so friends with this plugin will see it.",
				}
			: {
					label: `Broken: Discord removed your ${label(roundTrip.effect)}`,
					subLabel: "The message arrived without the hidden effect, so nobody else will see it play.",
				}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<View style={{ paddingHorizontal: 16 }}>
						<Text color="text-muted" variant="text-sm/normal">
							Send one with the /fx command: pick an effect, type your message, send. People
							with this plugin who have the channel open see the effect. Everyone else sees an
							ordinary message.
						</Text>
					</View>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Play effects from others"
							subLabel={
								s.messageEffects
									? "Effects other people send play when you have the channel open."
									: "Only your own play. Other people's show as ordinary messages."
							}
							icon={rowIcon("ReactionIcon", "StarIcon")}
							value={s.messageEffects}
							onValueChange={(messageEffects: boolean) => update({ messageEffects })}
						/>
					</TableRowGroup>

					<TableRowGroup
						title="Test it alone"
						description="Your effect plays as you send it. This checks the copy Discord's server sends back, which is exactly what your friends get."
						hasIcons
					>
						<TableRow
							label={check.label}
							subLabel={check.subLabel}
							icon={rowIcon(roundTrip?.survived === false ? "WarningIcon" : "CircleCheckIcon", "InformationIcon")}
						/>
					</TableRowGroup>

					<TableRowGroup title="Preview" description="Tap one to see it here." hasIcons>
						{OFFERED_MESSAGE_EFFECTS.filter(effect => native?.messageCapabilities?.[effect.value] !== false).map(effect => (
							<TableRow
								key={effect.value}
								label={effect.label}
								subLabel={!native?.supported && effect.value === "glitch" ? "Legacy: a short screen shake without pixel tearing." : effect.subLabel}
								icon={rowIcon("PlayIcon")}
								onPress={() => preview(effect.value)}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
