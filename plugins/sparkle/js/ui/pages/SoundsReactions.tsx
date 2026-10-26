import { MOODS } from "../../lib/moods"
import { lookOf } from "../../native"
import { rowIcon } from "../icon"
import { REACTIONS_ROUTE } from "../routes"
import { useBottomPadding } from "../safeArea"
import { call, update, useSettings } from "../state"
import { ReactNavigationNative } from "@revenge-mod/externals/react-navigation"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/** Its sound effects and volume, then what it reacts to, and what it does during voice calls. */
export default function SoundsReactions() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow } = Design as any

	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()
	const moodsOn = MOODS.filter(mood => !s.moodsOff.includes(mood.id)).length
	const bottom = useBottomPadding()
	const name = s.name?.trim() || lookOf(s.look).defaultName
	const soundsOff = "Turn on Sound effects first."
	// "Idle only" (2) was folded into Quieter; a pet still set to it keeps behaving that way.
	const voice = s.voiceMode === 3 ? "3" : s.voiceMode === 0 ? "0" : "1"

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup title="Sounds" hasIcons>
						<TableSwitchRow
							label="Sound effects"
							subLabel="Little 8-bit blips, boings and chimes when it hops, gets thrown, blows or reacts. Follows your media volume."
							icon={rowIcon("SoundboardIcon", "MusicIcon")}
							value={s.sounds}
							onValueChange={(sounds: boolean) => update({ sounds })}
						/>
						<TableSwitchRow
							label="Quiet on silent"
							subLabel={s.sounds ? "No sounds while your phone is on silent or vibrate. Off: it plays anyway, on the media volume." : soundsOff}
							icon={rowIcon("BellSlashIcon", "BellIcon")}
							disabled={!s.sounds}
							value={s.quietOnSilent}
							onValueChange={(quietOnSilent: boolean) => update({ quietOnSilent })}
						/>
						<TableRow
							label="Play a sound"
							subLabel={s.sounds ? "Hear how loud it is (plays even on silent)." : soundsOff}
							icon={rowIcon("PlayIcon")}
							disabled={!s.sounds}
							onPress={() => call("testSound")}
						/>
					</TableRowGroup>

					<TableRadioGroup
						key={`volume-${s.volume}`}
						title="Volume"
						description={s.sounds ? "On top of your media volume." : soundsOff}
						defaultValue={String(s.volume <= 40 ? 35 : s.volume <= 80 ? 70 : 100)}
						onChange={(value: string) => update({ volume: Number(value) })}
					>
						<TableRadioRow label="Quiet" value="35" disabled={!s.sounds} />
						<TableRadioRow label="Normal" value="70" disabled={!s.sounds} />
						<TableRadioRow label="Loud" value="100" disabled={!s.sounds} />
					</TableRadioGroup>

					<TableRowGroup title="Reacts to" hasIcons>
						<TableSwitchRow
							label="Discord"
							subLabel="Mentions, DMs, your sends, keywords in the channel you have open, opening a channel, and joining voice."
							icon={rowIcon("ChatIcon", "ic_message")}
							value={s.discord}
							onValueChange={(discord: boolean) => update({ discord })}
						/>
						<TableRow
							label="Message reactions"
							subLabel={s.discord ? `${moodsOn} of ${MOODS.length} on. Choose the keywords for each.` : "Turn on Discord first."}
							icon={rowIcon("FiltersHorizontalIcon", "SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(REACTIONS_ROUTE)}
						/>
						<TableSwitchRow
							label="Shaking the phone"
							subLabel={`Shake the phone and ${name} goes tumbling, then comes down dizzy. Uses the motion sensor only while ${name} is on screen.`}
							icon={rowIcon("MobilePhoneIcon", "PhoneIcon")}
							value={s.shake}
							onValueChange={(shake: boolean) => update({ shake })}
						/>
						<TableSwitchRow
							label="The battery"
							subLabel="Cheers when you plug in, and gets sleepy when the battery drops to 15%."
							icon={rowIcon("FlashIcon", "MobilePhoneIcon")}
							value={s.battery}
							onValueChange={(battery: boolean) => update({ battery })}
						/>
					</TableRowGroup>

					<TableRadioGroup key={`voice-${voice}`} title="During voice calls" defaultValue={voice} onChange={(v: string) => update({ voiceMode: Number(v) })}>
						<TableRadioRow label="As usual" value="0" />
						<TableRadioRow label="Quieter" subLabel="Sounds spaced out, no Nyan music" value="1" />
						<TableRadioRow label="Hidden" subLabel="Leaves until you hang up" value="3" />
					</TableRadioGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
