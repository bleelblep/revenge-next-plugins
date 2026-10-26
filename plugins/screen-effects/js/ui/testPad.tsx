import { useTestPad, useSettings } from "./state"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/**
 * Bright, busy tiles make every effect easy to read: a distortion is hard to see over a flat
 * background. These are content colours, fixed on purpose (design language §3.5).
 */
const TILE_COLOURS = ["#5865F2", "#EB459E", "#FEE75C", "#57F287", "#ED4245", "#3BA5DC"]
const COLUMNS = 6
const ROWS = 4

/**
 * The test pad at the top of the Screen effect, Particles and Screen filter pages: pick something
 * below, then tap here to see it. While the page is open, taps play even with Tap effects on Off or
 * a Quick Toggles switch off (native `setTestPad`), so choices can be tried where they are made.
 */
export function TestPad() {
	const { View } = ReactNative
	const { Text } = Design

	useTestPad()
	const s = useSettings()

	const hint = s.charge
		? "Charge on hold is on: hold, then let go."
		: s.style === "lens"
			? "Hold and drag to move the lens."
			: s.style === "jelly"
				? "Press, drag and let go to wobble the jelly."
				: s.style === "blackhole"
					? "Hold to grow the black hole, then let go."
					: s.filter === "frost"
						? "Wipe the frost with your finger."
						: "Tap anywhere on this page."

	return (
		<View style={{ gap: 8 }}>
			<View style={{ marginHorizontal: 16, borderRadius: 16, overflow: "hidden", height: 180 }}>
				{Array.from({ length: ROWS }, (_, row) => (
					<View key={row} style={{ flex: 1, flexDirection: "row" }}>
						{Array.from({ length: COLUMNS }, (_, col) => (
							<View
								key={col}
								style={{
									flex: 1,
									backgroundColor: TILE_COLOURS[(row * 2 + col) % TILE_COLOURS.length],
									opacity: (row + col) % 2 ? 0.75 : 1,
								}}
							/>
						))}
					</View>
				))}
				<View
					pointerEvents="none"
					style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
				>
					<Text
						variant="heading-lg/extrabold"
						style={{ color: "#FFFFFF", textShadowColor: "rgba(0,0,0,0.6)", textShadowRadius: 6 }}
					>
						Tap, hold or drag
					</Text>
				</View>
			</View>
			<Text color="text-muted" variant="text-sm/normal" style={{ paddingHorizontal: 16 }}>
				{hint} Taps here always play, even with Tap effects off.
			</Text>
		</View>
	)
}
