/**
 * Where a sticker's text goes, shared by the live preview (ui/TextLayer.tsx) and, line for line,
 * the native renderer (SekaiStickers.kt `render`), so the preview matches the PNG.
 *
 * - (x, y) is the middle of the text, in sticker pixels (296x256), where the editor's dot sits.
 *   The middle is halfway between the font's ascent and descent, which on Yuruka is about the
 *   middle of a capital letter.
 * - Lines stack around that point, `lineSpacing` percent of the font size apart, so spacing grows
 *   with the text instead of overlapping it.
 * - `bend` curves each line along its own arc, centred on the line. The arc's radius is
 *   400 / |bend| font sizes: bend 100 is about the web maker's curve, small values barely bend.
 * - `rotate` turns the whole block around (x, y), in tenths of a radian, as the maker does.
 * - The picture is fitted and centred as in the maker, then scaled by `imageScale` percent around
 *   the sticker's centre and moved by `imageX` / `imageY`.
 *
 * The web maker (and 0.1.x) anchored the text at its first baseline instead, and its curve started
 * at the anchor and ran off to the right, 3.5 font sizes above it. `defaults` and `upgrade` convert
 * the maker's numbers and old saved stickers so they land where they used to.
 */

import type { CharacterRow } from '../data/characters'
import type { FontMetrics } from './native'
import type { StickerDesign } from './store'

export const WIDTH = 296
export const HEIGHT = 256
export const LINE_SPACING = 105
/** What the Curve switch turns on. */
export const DEFAULT_BEND = 50

const PICTURE = { imageScale: 100, imageX: 0, imageY: 0 }

export const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

/** How far below the middle of its text box a line's baseline is. */
const baselineOffset = (size: number, m: FontMetrics) => ((m.ascent - m.descent) / 2) * size

/** Middle of a block whose first baseline is at [baseline], as the maker positions text. */
function middleFromBaseline(baseline: number, lines: number, gap: number, size: number, m: FontMetrics) {
	return baseline - baselineOffset(size, m) + ((lines - 1) / 2) * gap
}

export function defaults(row: CharacterRow, m: FontMetrics): StickerDesign {
	const [, , , , text, x, y, rotate, size] = row
	const lines = text.split('\n').length
	return {
		v: 2,
		text,
		x,
		y: Math.round(middleFromBaseline(y, lines, (size * LINE_SPACING) / 100, size, m)),
		rotate,
		size,
		lineSpacing: LINE_SPACING,
		bend: 0,
		...PICTURE,
	}
}

/** Brings a design from 0.1.x (first-baseline anchor, absolute `spacing`, `curve` switch) up to date. */
export function upgrade(design: any, m: FontMetrics): StickerDesign {
	if (design?.v === 2) return { ...PICTURE, ...design }
	const size = Number(design?.size) || 40
	const spacing = Number(design?.spacing) || 36
	const text = String(design?.text ?? '')
	return {
		v: 2,
		text,
		x: Number(design?.x) || WIDTH / 2,
		y: Math.round(middleFromBaseline(Number(design?.y) || 40, text.split('\n').length, spacing, size, m)),
		rotate: Number(design?.rotate) || 0,
		size,
		lineSpacing: clamp(Math.round((spacing / size) * 100), 40, 250),
		bend: design?.curve ? 100 : 0,
		...PICTURE,
	}
}

export interface Piece {
	text: string
	/** Centre of this piece's text box, relative to (x, y) before `rotate`. */
	cx: number
	cy: number
	/** Its own turn, in radians, on top of the block's. */
	turn: number
}

export const letters = (line: string) => Array.from(line)

/**
 * Lays out [design] the way `render` draws it. [widthOf] gives a letter's width as a fraction of
 * the font size (only curved lines need it).
 */
export function layout(design: StickerDesign, m: FontMetrics, widthOf: (letter: string) => number): Piece[] {
	const lines = design.text.split('\n')
	const gap = (design.size * design.lineSpacing) / 100
	const pieces: Piece[] = []
	lines.forEach((line, index) => {
		const cy = (index - (lines.length - 1) / 2) * gap
		if (!design.bend) {
			pieces.push({ text: line, cx: 0, cy, turn: 0 })
			return
		}
		const radius = (design.size * 400) / Math.abs(design.bend)
		const sign = design.bend > 0 ? 1 : -1
		const chars = letters(line)
		const widths = chars.map(letter => widthOf(letter) * design.size)
		const total = widths.reduce((sum, w) => sum + w, 0)
		let along = 0
		chars.forEach((letter, i) => {
			const angle = (along + widths[i] / 2 - total / 2) / radius
			along += widths[i]
			pieces.push({
				text: letter,
				cx: radius * Math.sin(angle),
				cy: cy + sign * radius * (1 - Math.cos(angle)),
				turn: sign * angle,
			})
		})
	})
	return pieces
}

/** Keeps the picture from being moved entirely off the sticker. */
export function movePicture(x: number, y: number) {
	return { imageX: Math.round(clamp(x, -WIDTH, WIDTH)), imageY: Math.round(clamp(y, -HEIGHT, HEIGHT)) }
}

/** Keeps the middle of the text on the sticker. */
export function place(x: number, y: number) {
	return { x: Math.round(clamp(x, 0, WIDTH)), y: Math.round(clamp(y, 0, HEIGHT)) }
}
