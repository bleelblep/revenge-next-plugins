import { DEFAULTS } from "../../defaults"
import { refreshChat } from "../../lib/chatRows"
import { getStorage, onEnabledChanged } from "../../lib/state"

/** How long the button stays out of sight after arming, so it isn't in the screenshot. */
const HIDE_MS = 8000

/**
 * The floating toggle that arms redaction from the chat itself.
 *
 * The awkward part of this control is that it is *in the photograph*. A button whose whole
 * purpose is "make this screenshot safe to post" is self-defeating if it's sitting in the
 * corner of every shot, so arming it hides it outright for a few seconds and then fades it
 * back, rather than leaving it on screen looking deliberate.
 *
 * Disarming does not hide it — you are no longer about to take a picture.
 */
export default function RedactToggle() {
	// Every `revenge.*` read happens here, at render, never at module scope. See rule 1.
	const React = revenge.react.React
	const { Pressable, Animated, Image } = revenge.react.ReactNative as any
	const { getAssetIdByName } = revenge.assets

	const storage = getStorage()

	// Deliberately NOT `storage.use()`: that is a hook, and `storage` is possibly-undefined, so
	// calling it conditionally would change the hook count between renders and crash the chat.
	// A plain subscription in an effect keeps the hook order fixed no matter what.
	const [enabled, setEnabled] = React.useState<boolean>(
		() => (storage?.cache as any)?.enabled ?? DEFAULTS.enabled,
	)
	const [hidden, setHidden] = React.useState(false)
	const opacity = React.useRef(new Animated.Value(1)).current
	const timer = React.useRef<any>(null)

	React.useEffect(() => {
		const unsubscribe = storage?.subscribe?.(() => {
			setEnabled((storage?.cache as any)?.enabled ?? DEFAULTS.enabled)
		})
		return () => {
			if (timer.current) clearTimeout(timer.current)
			try {
				unsubscribe?.()
			} catch {
				/* already gone */
			}
		}
	}, [storage])

	const onPress = React.useCallback(() => {
		const next = !enabled

		try {
			storage?.set({ enabled: next })
			onEnabledChanged(next)
			refreshChat()
		} catch (error) {
			console.error("[ScreenshotRedactor] toggle failed:", error)
		}

		setEnabled(next)

		if (timer.current) {
			clearTimeout(timer.current)
			timer.current = null
		}

		if (!next) {
			// Disarming: come straight back, in case a hide was still in flight.
			setHidden(false)
			opacity.setValue(1)
			return
		}

		// Arming: gone immediately rather than faded -- a fade would still be half-visible in a
		// shot taken a moment later -- then back after HIDE_MS so it can be turned off again.
		setHidden(true)
		opacity.setValue(0)
		timer.current = setTimeout(() => {
			timer.current = null
			setHidden(false)
			Animated.timing(opacity, { toValue: 1, duration: 320, useNativeDriver: true }).start()
		}, HIDE_MS)
	}, [enabled, storage, opacity, Animated])

	const icon = getAssetIdByName(enabled ? "EyeSlashIcon" : "EyeIcon") ?? getAssetIdByName("EyeIcon")

	return (
		<Animated.View
			// `none` while hidden so a tap in that corner reaches the message underneath rather
			// than silently toggling something invisible.
			pointerEvents={hidden ? "none" : "box-none"}
			style={{
				position: "absolute",
				right: 16,
				bottom: 16,
				opacity,
				// Android draws by elevation rather than zIndex; set both.
				zIndex: 1000,
				elevation: 8,
			}}
		>
			<Pressable
				accessibilityLabel={enabled ? "Turn redaction off" : "Redact names and avatars"}
				accessibilityRole="button"
				onPress={onPress}
				style={{
					width: 44,
					height: 44,
					borderRadius: 22,
					alignItems: "center",
					justifyContent: "center",
					// Literal hex: revenge.discord.design.RawColors doesn't exist (rule 4).
					backgroundColor: enabled ? "#F23F43" : "#2B2D31",
					borderWidth: 1,
					borderColor: "#1E1F22",
				}}
			>
				<Image source={icon} style={{ width: 20, height: 20, tintColor: "#FFFFFF" }} />
			</Pressable>
		</Animated.View>
	)
}
