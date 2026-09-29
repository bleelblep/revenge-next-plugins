import { TAG } from '../../lib/state'
import { type Anchor, SWIPE_DISTANCE, SWIPE_TRAVEL, swipeDrag, useSwipeState } from '../../lib/swipe'

const BLURPLE = '#5865F2'
const GREEN = '#23A55A'

/** Bands in the capsule's gradient: enough that no step shows at the capsule's full height. */
const BANDS = 40

function mix(from: string, to: string, t: number): string {
	const channel = (hex: string, i: number) => Number.parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
	const out = [0, 1, 2].map(i => Math.round(channel(from, i) + (channel(to, i) - channel(from, i)) * t))
	return `rgb(${out.join(', ')})`
}

/**
 * Top (green) to bottom (blurple). RN has no gradient fill and Discord's native gradient view is not
 * reachable by a stable name, so the gradient is thin stacked bands; the capsule's rounded clip
 * hides their square ends. Computed once.
 */
let gradient: string[] | undefined
const gradientBands = () => {
	gradient ??= Array.from({ length: BANDS }, (_, i) => mix(GREEN, BLURPLE, i / (BANDS - 1)))
	return gradient
}

/**
 * Discord bundles `@gorhom/portal` (module 4708 on 348.5: `Portal`, `PortalHost`, `PortalProvider`,
 * `usePortal`). Its `Portal` draws its children into the app-level host, outside the chat bar, which
 * clips anything drawn past the send button's own bounds (0.4.1's indicator never showed).
 */
function getPortal(): any {
	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const mod = lookupModule<any>(withProps('Portal', 'PortalHost', 'PortalProvider'))?.[0]
		return mod?.Portal ?? mod?.default?.Portal
	} catch {
		return undefined
	}
}

let Boundary: any

/**
 * Renders nothing instead of taking the chat bar down if the capsule throws -- for one, `Portal`
 * throws when there is no `PortalProvider` above the chat bar. Built on first use, because
 * `React.Component` must not be read at module scope.
 */
function getBoundary(): any {
	if (Boundary) return Boundary
	const React = revenge.react.React
	Boundary = class extends React.Component<{ children?: any }, { failed: boolean }> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			console.error(`${TAG} swipe capsule failed, hold-and-swipe still works without it:`, error)
		}
		render() {
			return this.state.failed ? null : this.props.children
		}
	}
	return Boundary
}

/**
 * The hold-and-swipe capsule, like Google Allo's: while the gesture is armed the send button
 * stretches up into a tall pill, and a knob carrying the send icon rides up it with the finger. Past
 * the send-unchanged point the knob brightens and a label says so. The pill is a gradient from
 * Discord blurple at the button to green at the top, where letting go sends unchanged.
 *
 * Drawn exactly over the real button (its page position comes from the touch that went down on it),
 * through the app-level portal. `pointerEvents="none"`: the touch stays with the button underneath.
 */
function Capsule({ Icon, anchor, armed, past }: { Icon?: any; anchor: Anchor; armed: boolean; past: boolean }) {
	const React = revenge.react.React
	const { Animated, Dimensions, Text, View } = revenge.react.ReactNative

	const grow = React.useRef(new Animated.Value(0)).current
	React.useEffect(() => {
		Animated.spring(grow, {
			toValue: armed ? 1 : 0,
			// Height is a layout prop, so this one stays on the JS driver.
			useNativeDriver: false,
			friction: 8,
			tension: 160,
		}).start()
	}, [armed])

	const size = Math.max(anchor.width, anchor.height)
	const knob = size - 8
	const drag = swipeDrag()
	const knobY = drag.interpolate({
		inputRange: [0, SWIPE_TRAVEL],
		outputRange: [0, -SWIPE_TRAVEL],
		extrapolate: 'clamp',
	})
	const labelOpacity = drag.interpolate({
		inputRange: [0, SWIPE_DISTANCE * 0.4, SWIPE_DISTANCE],
		outputRange: [0, 0.8, 1],
		extrapolate: 'clamp',
	})

	// Bottom-anchored on the button: it grows upward from the button's own shape.
	const left = anchor.x + anchor.width / 2 - size / 2
	const bottom = anchor.y + anchor.height

	return (
		<View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
			<Animated.View
				style={{
					position: 'absolute',
					left,
					top: grow.interpolate({ inputRange: [0, 1], outputRange: [bottom - size, bottom - size - SWIPE_TRAVEL] }),
					width: size,
					height: grow.interpolate({ inputRange: [0, 1], outputRange: [size, size + SWIPE_TRAVEL] }),
					opacity: grow.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
					borderRadius: size / 2,
					backgroundColor: BLURPLE,
					overflow: 'hidden',
					alignItems: 'center',
					justifyContent: 'flex-end',
					paddingBottom: 4,
					elevation: 8,
				}}
			>
				<View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
					{gradientBands().map((colour, i) => (
						<View key={i} style={{ flex: 1, backgroundColor: colour }} />
					))}
				</View>
				<Animated.View
					style={{
						width: knob,
						height: knob,
						borderRadius: knob / 2,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: past ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.28)',
						transform: [{ translateY: knobY }],
					}}
				>
					{Icon ? (
						<Icon size="sm" color="#FFFFFF" />
					) : (
						<Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700' }}>↑</Text>
					)}
				</Animated.View>
			</Animated.View>

			{/* The label sits just left of the capsule, level with its top. */}
			<Animated.View
				style={{
					position: 'absolute',
					right: Dimensions.get('window').width - left + 8,
					top: bottom - size - SWIPE_TRAVEL + (size - 28) / 2,
					height: 28,
					justifyContent: 'center',
					paddingHorizontal: 12,
					borderRadius: 14,
					backgroundColor: past ? GREEN : 'rgba(17, 18, 20, 0.9)',
					// Tied to the capsule too, so it leaves with it when the finger lifts.
					opacity: Animated.multiply(labelOpacity, grow),
				}}
			>
				<Text numberOfLines={1} style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>
					{past ? 'Let go to send unchanged' : 'Send unchanged'}
				</Text>
			</Animated.View>
		</View>
	)
}

export default function SwipeIndicator({ Icon }: { Icon?: any }) {
	const { armed, past, anchor } = useSwipeState()
	const Portal = getPortal()
	if (!Portal || !anchor) return null
	const SafeBoundary = getBoundary()
	return (
		<SafeBoundary>
			<Portal>
				<Capsule Icon={Icon} anchor={anchor} armed={armed} past={past} />
			</Portal>
		</SafeBoundary>
	)
}
