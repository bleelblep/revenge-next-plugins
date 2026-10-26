import { rowIcon } from "../icon"
import { COMBO_SKIN_OPTIONS, EFFECT_OPTIONS, FILTER_OPTIONS, PARTICLE_OPTIONS, labelOf, savedUnavailable } from "../options"
import {
	DEBUG_ROUTE,
	EFFECT_ROUTE,
	FILTER_ROUTE,
	LICENSE_ROUTE,
	MESSAGE_FX_ROUTE,
	PARTICLES_ROUTE,
	POWER_ROUTE,
	TRIGGERS_ROUTE,
} from "../routes"
import { useBottomPadding } from "../safeArea"
import { useNative, useSettings } from "../state"
import { TAP_LEVELS, tapLevel } from "../tapLevel"
import { useChangelog } from "../../../../../shared/changelog"
import { ReactNavigationNative } from "@revenge-mod/externals/react-navigation"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

const DEBUG: boolean = false

/**
 * Root page, laid out like Ghost Log Native Beta's: a context card, a status card only when
 * something is wrong, one muted scope line, then two groups: what effects look like (each picker
 * page has its own test pad) and when they play. Debug and Licence last. Each row's sub-label says
 * what is set now.
 */
export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow } = Design
	const { useNavigation } = ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()

	const tap = s.onTap ? `Taps: ${TAP_LEVELS[tapLevel(s)].label}${s.charge ? ", charge on hold" : ""}` : "Taps off"
	const when = [tap, s.onSend && "sends", s.onReceive && "mentions and DMs"].filter(Boolean).join(" · ")
	const problems = [
		native && !native.hooked && "The touch hooks could not be installed, so taps and messages play nothing.",
		native && !native.textHooked && "Typing could not be hooked, so power mode can't run.",
	].filter(Boolean) as string[]

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Effects for taps, typing and messages
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								Taps bend the screen or throw particles, filters change how Discord looks, and
								power mode throws particles as you type. All of it is only on your phone, except /fx
								messages, which play for friends who also have VFX.
							</Text>
						</View>
					</Card>

					{/* Fail loudly on the page people land on: with the hooks missing, nothing plays. */}
					{problems.length ? (
						<Card
							variant="secondary"
							border="none"
							style={{ backgroundColor: "#da373c1f", borderColor: "#da373c66", borderWidth: 1 }}
						>
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-feedback-critical" variant="text-md/semibold">
									Some effects can't play
								</Text>
								<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
									{`${problems.join(" ")} The Revenge log has the reason.`}
								</Text>
							</View>
						</Card>
					) : null}

					<Text color="text-muted" variant="text-sm/normal">
						{native && !native.supported
							? s.legacyRipple
								? "Legacy mode for older Android: screen effects bend a live capture of the window, filters are drawn as overlays, and particles all work."
								: "Legacy mode for older Android, with Legacy distortions off in Debug: only Shockwave and both inks play, as flat overlays. Filters and particles all work."
							: "Every effect, filter and particle runs at full quality on this phone."}
					</Text>

					<TableRowGroup title="Look" hasIcons>
						<TableRow
							label="Screen effect"
							subLabel={`${labelOf(EFFECT_OPTIONS, s.style)}${savedUnavailable(native, "effects", s.style) ? " · saved, unavailable in this mode" : ""}`}
							icon={rowIcon("WaveformIcon", "ScreenIcon")}
							arrow
							onPress={() => navigation.navigate(EFFECT_ROUTE)}
						/>
						<TableRow
							label="Particles"
							subLabel={labelOf(PARTICLE_OPTIONS, s.particles)}
							icon={rowIcon("StarIcon", "ReactionIcon")}
							arrow
							onPress={() => navigation.navigate(PARTICLES_ROUTE)}
						/>
						<TableRow
							label="Screen filter"
							subLabel={`${labelOf(FILTER_OPTIONS, s.filter)}${savedUnavailable(native, "filters", s.filter) ? " · saved, unavailable in this mode" : ""}`}
							icon={rowIcon("ImageIcon", "PaintPaletteIcon")}
							arrow
							onPress={() => navigation.navigate(FILTER_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Play" hasIcons>
						<TableRow
							label="When effects play"
							subLabel={when}
							icon={rowIcon("TimerIcon", "ClockIcon")}
							arrow
							onPress={() => navigation.navigate(TRIGGERS_ROUTE)}
						/>
						<TableRow
							label="Power mode"
							subLabel={s.powerMode ? `On, with the ${labelOf(COMBO_SKIN_OPTIONS, s.comboSkin ?? "arcade")} skin` : "Off"}
							icon={rowIcon("MagicWandIcon", "StarIcon")}
							arrow
							onPress={() => navigation.navigate(POWER_ROUTE)}
						/>
						<TableRow
							label="Message effects"
							subLabel="Send one with /fx; preview them all"
							icon={rowIcon("SendMessageIcon", "ChatIcon")}
							arrow
							onPress={() => navigation.navigate(MESSAGE_FX_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						{DEBUG && (<TableRow
							label="Debug"
							subLabel={native ? `Android API ${native.apiLevel} · ${native.supported ? "modern" : "legacy"} renderer` : "Renderer switches and capture timings"}
							icon={rowIcon("BugIcon", "ic_debug")}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>)}
						<TableRow
							label="Licence"
							subLabel="CC0-1.0, with one GPL file"
							icon={rowIcon("BookCheckIcon", "InformationIcon", "ic_info")}
							arrow
							onPress={() => navigation.navigate(LICENSE_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
