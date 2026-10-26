import { lookOf } from "../../native"
import { BOSS_PETS } from "../../bossPets"
import { FieldRow } from "../fieldGroup"
import { rowIcon } from "../icon"
import { RateSlider } from "../rateSlider"
import { SPELLS_ROUTE } from "../routes"
import { useBottomPadding } from "../safeArea"
import { call, update, useSettings } from "../state"
import { ReactNavigationNative } from "@revenge-mod/externals/react-navigation"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/** The extras: bubbles or rainbow puffs, magic, treats, eating buttons, and buttons to try them. */
export default function Fun() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, TableRadioGroup, TableRadioRow, Slider, Text } = Design as any

	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()
	const bottom = useBottomPadding()
	const spells =
		s.spellMode === "allow"
			? `Only ${s.spellList.length} chosen`
			: s.spellList.length
				? `Everything except ${s.spellList.length}`
				: "Everything VFX has"
	const pet = lookOf(s.look)
	const nyan = s.look === 1
	const boss = BOSS_PETS.find(b => b.id === s.look)
	const horseman = boss?.id === BOSS_PETS[0].id
	const name = s.name?.trim() || pet.defaultName
	const needsShow = s.show ? "" : ` Turn on Show ${name} first.`
	const bubbleChoice = !s.bubbles ? "off" : s.bubbleFx ? "fx" : "plain"

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<RateSlider
						title="Treats"
						description={`A treat${nyan ? " (pop-tarts, cake, donuts, ice cream, fish, milk)" : ""} turns up: with Gravity on it drops to the floor, off it floats. Tap it and ${name} goes to eat it, which makes it very happy. Twice as often when it's lonely.`}
						on={s.treats}
						rate={s.treatRate}
						minSeconds={240}
						maxSeconds={540}
						onChange={(treats, treatRate) => update({ treats, treatRate })}
					/>

					<RateSlider
						title="Eats buttons and icons"
						description={`It gobbles a small button near it. Tap ${name} and it gives everything back. Nothing changes for real: the button only hides.`}
						on={s.eat}
						rate={s.eatRate}
						minSeconds={40}
						maxSeconds={120}
						onChange={(eat, eatRate) => update({ eat, eatRate })}
					/>
					<TableRowGroup hasIcons>
						<TableRow
							label="Give everything back"
							subLabel="Puts back anything it has eaten, straight away."
							icon={rowIcon("RefreshIcon", "ic_refresh")}
							onPress={() => call("giveBack")}
						/>
					</TableRowGroup>

					<TableRadioGroup
						key={`bubbles-${bubbleChoice}`}
						title={nyan ? "Rainbow puffs" : "Bubbles"}
						description={
							nyan
								? "Now and then, and when it's happy, rainbow stars drift out to the edges and burst. With the screen effect, rainbow bands drift across the screen too and each burst ripples it."
								: "Now and then, and when it's happy, bubbles drift out to the edges and pop. With the screen effect, the screen shimmers with soap-bubble colours too and each pop ripples it."
						}
						defaultValue={bubbleChoice}
						onChange={(value: string) => update({ bubbles: value !== "off", bubbleFx: value === "fx" })}
					>
						<TableRadioRow label="Off" value="off" />
						<TableRadioRow label={nyan ? "Puffs" : "Bubbles"} value="plain" />
						<TableRadioRow
							label={nyan ? "Puffs and rainbow screen" : "Bubbles and bubble screen"}
							subLabel="Below Android 13 the colours show but the screen doesn't bend. Works alongside VFX."
							value="fx"
						/>
					</TableRadioGroup>

					<RateSlider
						title="Magic tricks"
						description="It casts a spell: VFX shows a random screen filter or effect for a few seconds. Needs VFX."
						on={s.magic}
						rate={s.magicRate}
						minSeconds={60}
						maxSeconds={180}
						onChange={(magic, magicRate) => update({ magic, magicRate })}
					/>
					<TableRowGroup hasIcons>
						<TableRow
							label="What spells can show"
							subLabel={spells}
							icon={rowIcon("FiltersHorizontalIcon", "SettingsIcon", "ic_settings")}
							arrow
							onPress={() => navigation.navigate(SPELLS_ROUTE)}
						/>
					</TableRowGroup>

					{nyan ? (
						<RateSlider
							title="Nyan party"
							description="Nyan Cat grows big in the middle of the screen with its space background, rainbow and song. Tap anywhere to end it. The song follows Sounds."
							on={s.nyanParty}
							rate={s.partyRate}
							minSeconds={900}
							maxSeconds={2400}
							onChange={(nyanParty, partyRate) => update({ nyanParty, partyRate })}
						/>
					) : null}

					{boss ? (
						<RateSlider
							title="Mischief"
							description={
								horseman
									? `${name} swings the scythe at your screen and slices it apart for a moment, or throws it: it bounces round the screen and comes back to his hand.`
									: `${name} goes for your screen: the chain hooks it and drags it away, the claws tear it three ways, or a head-butt bulges and cracks it. Everything springs back.`
							}
							on={s.attacks}
							rate={s.attackRate}
							minSeconds={120}
							maxSeconds={300}
							onChange={(attacks, attackRate) => update({ attacks, attackRate })}
						/>
					) : null}
					{boss ? (
						<TableRowGroup hasIcons>
							<TableSwitchRow
								label="Screen tricks"
								subLabel="The slicing, hooking, tearing and cracking use a snapshot of the screen. Off, the moves still play (and the Horseman only throws). Never while the keyboard is up."
								icon={rowIcon("ImageIcon", "PlayIcon")}
								value={s.attackFx}
								onValueChange={(attackFx: boolean) => update({ attackFx })}
							/>
						</TableRowGroup>
					) : null}
					{horseman ? (
						<RateSlider
							title="The horse"
							description={`Now and then his horse wanders in along the floor and grazes a while. Tap it while ${name} is out and he rides it round the screen; tap him to get off.`}
							on={s.companion}
							rate={s.companionRate}
							minSeconds={1200}
							maxSeconds={2400}
							onChange={(companion, companionRate) => update({ companion, companionRate })}
						/>
					) : null}
					{horseman ? (
						<TableRowGroup>
							<FieldRow label={`Ride for ${s.rideMinutes} ${s.rideMinutes === 1 ? "minute" : "minutes"}`} description="Then he gets off and the horse trots away. Tap him any time to end it sooner.">
								<Slider step={1} value={s.rideMinutes} minimumValue={1} maximumValue={5} onValueChange={(v: number) => update({ rideMinutes: Math.round(v) })} />
							</FieldRow>
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Try it" hasIcons>
						<TableRow
							label={nyan ? "Blow rainbow puffs now" : "Blow bubbles now"}
							subLabel={`See them without waiting.${needsShow}`}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("blow")}
						/>
						{nyan ? (
							<TableRow
								label="Start a Nyan party"
								subLabel={s.show ? "Plays the song even on silent. Tap anywhere to end it." : needsShow.trim()}
								icon={rowIcon("PlayIcon")}
								disabled={!s.show}
								onPress={() => call("party")}
							/>
						) : null}
						{boss ? (
							<TableRow
								label="Attack now"
								subLabel={s.show ? "A random weapon, straight away." : needsShow.trim()}
								icon={rowIcon("PlayIcon")}
								disabled={!s.show}
								onPress={() => call("attack")}
							/>
						) : null}
						{horseman ? (
							<TableRow
								label="Call the horse"
								subLabel={s.show ? "It walks in now. Tap it to ride." : needsShow.trim()}
								icon={rowIcon("PlayIcon")}
								disabled={!s.show}
								onPress={() => call("callHorse")}
							/>
						) : null}
						{horseman ? (
							<TableRow
								label="Ride now"
								subLabel={s.show ? "Straight onto the horse. Tap him to get off." : needsShow.trim()}
								icon={rowIcon("PlayIcon")}
								disabled={!s.show}
								onPress={() => call("ride")}
							/>
						) : null}
						<TableRow
							label="Cast a spell now"
							subLabel={`Needs VFX.${needsShow}`}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("castMagic")}
						/>
						<TableRow
							label="Drop a treat now"
							subLabel={s.show ? `Tap it and ${name} comes to eat it.` : needsShow.trim()}
							icon={rowIcon("PlayIcon")}
							disabled={!s.show}
							onPress={() => call("dropTreat")}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
