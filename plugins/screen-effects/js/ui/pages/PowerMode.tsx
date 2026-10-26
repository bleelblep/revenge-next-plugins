import { type ComboSkin, type PowerParticleStyle, callNative } from "../../native"
import { CustomParticlesInput } from "../customInput"
import { FieldGroup } from "../fieldGroup"
import { dangerIcon, rowIcon } from "../icon"
import { COMBO_SKIN_OPTIONS, POWER_PARTICLE_OPTIONS, labelOf } from "../options"
import { useBottomPadding } from "../safeArea"
import { refreshNative, update, useNative, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { AlertActionCreators } from "@revenge-mod/discord/actions"
import { Design } from "@revenge-mod/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

function previewHighScore() {
	callNative("previewHighScore").catch(error =>
		reportError("[ScreenEffects] high score preview failed:", error),
	)
}

export default function PowerMode() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TableRadioGroup,
		TableRadioRow,
		TextInput,
		AlertModal,
		AlertActionButton,
	} = Design
	const Alerts = AlertActionCreators

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()
	const [draft, setDraft] = React.useState("")
	const best = native?.highScore ?? 0
	const skin: ComboSkin = s.comboSkin ?? "arcade"
	const arcade = skin === "arcade"
	const pickSkin = (comboSkin: ComboSkin) =>
		// Moving off Arcade with the default sparks switches to the skin's own effects, so its coins,
		// flames or petals aren't buried in sparks. Any other particle choice is kept.
		update(comboSkin !== "arcade" && s.powerParticles === "sparks" ? { comboSkin, powerParticles: "skin" } : { comboSkin })

	// Discord doesn't resize its window for the keyboard, so it covered the Try it box at the bottom.
	// While it's open its height is added below the content, and tapping the box scrolls it up to sit
	// just above the keyboard, with room over it for the counter and finishes. The tap is caught on a
	// plain View around the field: Discord's TextInput may not pass onFocus through.
	const { Keyboard } = ReactNative
	const scrollRef = React.useRef<any>(null)
	const tryTapped = React.useRef(false)
	const [keyboard, setKeyboard] = React.useState(0)
	React.useEffect(() => {
		const show = Keyboard.addListener("keyboardDidShow", (e: any) => {
			setKeyboard(e?.endCoordinates?.height ?? 0)
			if (tryTapped.current) setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60)
		})
		const hide = Keyboard.addListener("keyboardDidHide", () => {
			setKeyboard(0)
			tryTapped.current = false
		})
		return () => {
			show.remove()
			hide.remove()
		}
	}, [])

	// The best score only reaches storage when a run ends; check back after typing pauses.
	React.useEffect(() => {
		if (!draft) return
		const timer = setTimeout(refreshNative, 1800)
		return () => clearTimeout(timer)
	}, [draft])

	/** Destructive, so confirmed -- the design language's rule for anything that removes. */
	const confirmReset = () => {
		const key = "ScreenEffectsResetHighScore"
		Alerts.openAlert(
			key,
			<AlertModal
				title="Reset your high score?"
				content={`Your best combo of ${best} will be forgotten, and the next run starts the record from zero.`}
				actions={
					<>
						<AlertActionButton
							text="Reset"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								update({}, { resetHighScore: true })
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<Page>
			<ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: bottom + (keyboard ? keyboard + 24 : 0) }}>
				<Stack spacing={24}>
					{native && !native.textHooked && (
						<View style={{ paddingHorizontal: 16 }}>
							<Text color="text-feedback-warning" variant="text-sm/medium">
								Typing could not be hooked on this phone, so power mode can't run. The
								Revenge log has the reason.
							</Text>
						</View>
					)}
					<TableRowGroup
						title="Power mode"
						description="Particles fly from the text cursor as you type, anywhere you can type in Discord. Pick them below; they're separate from your tap particles."
						hasIcons
					>
						<TableSwitchRow
							label="Power mode"
							subLabel="Particles on every character typed."
							icon={rowIcon("MagicWandIcon", "StarIcon")}
							value={s.powerMode}
							onValueChange={(powerMode: boolean) => update({ powerMode })}
						/>
						{s.powerMode ? (
							<TableSwitchRow
								label="Combo counter"
								subLabel="Counts keystrokes in a row above the text box. A pause of 1.5 seconds ends the combo."
								icon={rowIcon("TimerIcon", "ClockIcon")}
								value={s.powerCombo}
								onValueChange={(powerCombo: boolean) => update({ powerCombo })}
							/>
						) : null}
						{s.powerMode ? (
							<TableSwitchRow
								label="Screen shake"
								subLabel="A small jolt per key, growing with the combo."
								icon={rowIcon("WaveformIcon", "ScreenIcon")}
								value={s.powerShake}
								onValueChange={(powerShake: boolean) => update({ powerShake })}
							/>
						) : null}
						{s.powerMode ? (
							<TableSwitchRow
								label={arcade ? "Fighting game sounds" : "Skin sounds"}
								subLabel={
									arcade
										? "A punch per key, getting heavier as you go. An announcer calls out 10, 25 and 100, and a long combo ends with a combo breaker. Uses the media volume."
										: `The ${labelOf(COMBO_SKIN_OPTIONS, skin)} skin's own sounds as you type, at its milestones and for a record. Uses the media volume.`
								}
								icon={rowIcon("SoundboardIcon", "MusicIcon")}
								value={s.comboSounds}
								onValueChange={(comboSounds: boolean) => update({ comboSounds })}
							/>
						) : null}
						{s.powerMode && s.comboSounds ? (
							<TableSwitchRow
								label="Quiet on silent"
								subLabel="No sounds while your phone is on silent or vibrate. Off: they play anyway, on the media volume."
								icon={rowIcon("BellSlashIcon", "BellIcon")}
								value={s.quietOnSilent}
								onValueChange={(quietOnSilent: boolean) => update({ quietOnSilent })}
							/>
						) : null}
					</TableRowGroup>

					{s.powerMode && (
						<TableRadioGroup
							title="Combo skin"
							description="The counter's look, the sounds, the rules and the high-score finish. Try one in the box at the bottom."
							defaultValue={skin}
							onChange={pickSkin}
						>
							{COMBO_SKIN_OPTIONS.map(option => (
								<TableRadioRow key={option.value} label={option.label} subLabel={option.subLabel} value={option.value} />
							))}
						</TableRadioGroup>
					)}

					{s.powerMode && (
						<TableRadioGroup
							// Remounted when a skin change switches it, since it only reads its default once.
							key={`particles-${s.powerParticles}`}
							title="Particles while typing"
							defaultValue={s.powerParticles}
							onChange={(powerParticles: PowerParticleStyle) => update({ powerParticles })}
						>
							{POWER_PARTICLE_OPTIONS.map(option => (
								<TableRadioRow
									key={option.value}
									label={option.label}
									subLabel={option.value === "custom" ? "Your own emoji, server emoji or images, set below." : option.subLabel}
									value={option.value}
								/>
							))}
						</TableRadioGroup>
					)}

					{s.powerMode && s.powerParticles === "custom" && (
						<CustomParticlesInput
							label="Custom typing particles"
							description="Type emoji straight from your keyboard, :shortcodes: for standard or server emoji, or paste image links. Each key throws a random one. Separate from your tap particles."
							saved={s.powerCustomInput}
							loaded={native?.powerCustomLoaded}
							onApply={(powerCustomInput, powerCustom) => update({ powerCustomInput }, { powerCustom })}
						/>
					)}

					{s.powerMode ? (
					<TableRowGroup
						title="High score"
						description="Beat your longest combo and a celebration plays once you stop typing, with the announcer when sounds are on. Records under 5 don't count, so a fresh start isn't all fanfare."
						hasIcons
					>
						<TableSwitchRow
							label="Track my high score"
							subLabel="Shows BEST under the combo counter, and celebrates a new record."
							icon={rowIcon("TrophyIcon", "CrownIcon")}
							value={s.trackHighScore}
							onValueChange={(trackHighScore: boolean) => update({ trackHighScore })}
						/>
						<TableRow
							label={best ? `Best combo: ${best}` : "No high score yet"}
							subLabel={best ? "Saved when a record-breaking run ends." : "Type fast in power mode to set one."}
							icon={rowIcon("MedalIcon", "TrophyIcon")}
						/>
						<TableRow
							label="Test the celebration"
							subLabel={
								arcade
									? `Plays the ${s.celebration === "arcade" ? "arcade finish" : s.celebration === "levelup" ? "level up" : "simple banner"} here, without touching your record.`
									: `Plays the ${labelOf(COMBO_SKIN_OPTIONS, skin)} finish here, without touching your record.`
							}
							icon={rowIcon("PlayIcon")}
							onPress={previewHighScore}
						/>
						<TableRow
							variant="danger"
							label="Reset high score"
							icon={dangerIcon("RefreshIcon", "UndoIcon")}
							disabled={!best}
							onPress={confirmReset}
						/>
					</TableRowGroup>
					) : null}

					{s.powerMode && arcade ? (
					<TableRadioGroup
						title="Celebration style"
						defaultValue={s.celebration}
						onChange={(celebration: "arcade" | "banner" | "levelup") => update({ celebration })}
					>
						<TableRadioRow
							label="Arcade finish"
							subLabel="The whole screen turns into a flashing CRT: NEW HIGH SCORE slams in, your hits count up, FLAWLESS! stamps down. Tap to continue."
							value="arcade"
						/>
						<TableRadioRow
							label="Simple banner"
							subLabel="A gold NEW HIGH SCORE! banner above the text box, with stars and confetti. Doesn't interrupt typing."
							value="banner"
						/>
						<TableRadioRow
							label="Level up"
							subLabel="A block-game LEVEL UP! in green pixel letters, with XP orbs and a chime. Doesn't interrupt typing."
							value="levelup"
						/>
					</TableRadioGroup>
					) : null}

					{s.powerMode && (
						<View
							onTouchStart={() => {
								tryTapped.current = true
								// Already open (moving here from another field): no keyboardDidShow is coming.
								if (keyboard) setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60)
							}}
						>
							<FieldGroup label="Try it">
								<TextInput placeholder="Type here…" value={draft} onChange={setDraft} />
							</FieldGroup>
						</View>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
