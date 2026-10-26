import { layout } from '../lib/design'
import { type FontMetrics, letterWidth } from '../lib/native'
import type { StickerDesign } from '../lib/store'
import * as ReactNative from 'react-native'

/**
 * The editor's live text, drawn by React Native on top of the character picture so it can follow
 * a finger without waiting for a PNG. It uses the font the native side registered and the same
 * layout (lib/design.ts), so it matches what Add draws.
 *
 * React Native text has no outline, so the 9px white stroke is faked with copies of each piece
 * pushed out in a ring around it, under the coloured one.
 */

const RING = Array.from({ length: 16 }, (_, i) => [Math.cos((i * Math.PI) / 8), Math.sin((i * Math.PI) / 8)])
/** Wide enough that a line never wraps; the box is centred on the piece. */
const BOX_WIDTH = 2000
const STROKE = 9

/** A letter not measured yet: roughly a Latin letter's or a CJK one's width. */
const guessWidth = (letter: string) => letterWidth(letter) ?? (letter.charCodeAt(0) < 0x2e80 ? 0.55 : 1)

export default function TextLayer({
	design,
	color,
	scale,
	metrics,
}: {
	design: StickerDesign
	color: string
	/** Sticker pixels per preview point. */
	scale: number
	metrics: FontMetrics
}) {
	const { View, Text } = ReactNative
	const fontSize = design.size / scale
	const boxHeight = (metrics.ascent + metrics.descent) * fontSize
	const radius = STROKE / 2 / scale
	const textStyle = {
		fontFamily: metrics.font,
		fontSize,
		// The text box is then exactly ascent + descent tall, as the layout assumes.
		includeFontPadding: false,
	} as const
	const copy = (text: string, key: string | number, fill: string, dx = 0, dy = 0) => (
		<View
			key={key}
			style={{
				position: 'absolute',
				left: 0,
				top: 0,
				width: BOX_WIDTH,
				height: boxHeight,
				alignItems: 'center',
				transform: dx || dy ? [{ translateX: dx }, { translateY: dy }] : undefined,
			}}
		>
			<Text allowFontScaling={false} numberOfLines={1} style={[textStyle, { color: fill }]}>
				{text}
			</Text>
		</View>
	)

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				left: design.x / scale,
				top: design.y / scale,
				width: 0,
				height: 0,
				transform: [{ rotate: `${(design.rotate / 10) * (180 / Math.PI)}deg` }],
			}}
		>
			{layout(design, metrics, guessWidth).map((piece, index) => (
				<View
					key={index}
					style={{
						position: 'absolute',
						left: piece.cx / scale - BOX_WIDTH / 2,
						top: piece.cy / scale - boxHeight / 2,
						width: BOX_WIDTH,
						height: boxHeight,
						transform: piece.turn ? [{ rotate: `${piece.turn * (180 / Math.PI)}deg` }] : undefined,
					}}
				>
					{RING.map(([dx, dy], k) => copy(piece.text, k, '#ffffff', dx * radius, dy * radius))}
					{copy(piece.text, 'fill', color)}
				</View>
			))}
		</View>
	)
}
