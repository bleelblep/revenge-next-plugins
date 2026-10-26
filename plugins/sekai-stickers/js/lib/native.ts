/** The Kotlin half (SekaiStickers.kt): draws a sticker to a PNG and says where it is. */

import * as native from '@revenge-mod/modules/native'
import { reportError } from '../../../../shared/report'

const ID = 'bleelblep.sekai-stickers'

export interface RenderOptions {
	/** Picture path on st.ayaka.one, like `airi/Airi_01.png`. */
	img: string
	text: string
	/** Middle of the text, in sticker pixels (296x256). */
	x: number
	y: number
	/** Tenths of a radian, -10..10, as the web maker uses. */
	rotate: number
	size: number
	/** Gap between lines, as a percentage of the font size. */
	lineSpacing: number
	/** -100..100; 0 is straight, positive arches up, negative dips down. */
	bend: number
	/** The picture's size (percent of fitted) and offset in sticker pixels. */
	imageScale: number
	imageX: number
	imageY: number
	color: string
}

export interface Rendered {
	path: string
	width: number
	height: number
}

export interface FontMetrics {
	/** React Native font family the preview uses, or undefined if it couldn't be registered. */
	font?: string
	/** Text box above and below the baseline, as fractions of the font size. */
	ascent: number
	descent: number
}

function call<T>(method: string, args: unknown[] = []): Promise<T> {
	return (native as any).callNativeMethod(`${ID}.${method}`, args)
}

export function renderSticker(options: RenderOptions): Promise<Rendered> {
	return call<Rendered>('render', [options])
}

export function nativeStatus(): Promise<{ fonts: boolean; installDir: string }> {
	return call('status')
}

/** Copies a render somewhere render clean-up never touches; returns the new path. */
export function keepRender(path: string, id: string): Promise<string> {
	return call('keep', [path, id])
}

export function forgetRender(id: string): Promise<boolean> {
	return call('forget', [id])
}

/** A fresh copy of a saved sticker to send. */
export function reuseSaved(id: string): Promise<Rendered> {
	return call('reuse', [id])
}

// YurukaStd's own hhea numbers, used until the native side answers.
let metrics: FontMetrics = { ascent: 0.88, descent: 0.12 }
let metricsLoaded: Promise<FontMetrics> | undefined

export function fontMetrics(): FontMetrics {
	return metrics
}

/** Asks the native side once for the preview font and its measurements. */
export function loadFontMetrics(): Promise<FontMetrics> {
	if (metricsLoaded) return metricsLoaded
	metricsLoaded = call<any>('metrics')
		.then(result => {
			metrics = {
				font: result?.registered ? result.font : undefined,
				ascent: Number(result?.ascent) || metrics.ascent,
				descent: Number(result?.descent) || metrics.descent,
			}
			return metrics
		})
		.catch(error => {
			reportError('[Sekai Stickers] font metrics failed:', error)
			metricsLoaded = undefined
			return metrics
		})
	return metricsLoaded
}

const widths = new Map<string, number>()

/** A letter's width as a fraction of the font size, or undefined until [measureLetters] has it. */
export function letterWidth(letter: string): number | undefined {
	return widths.get(letter)
}

/** Measures any of [letters] not measured yet. Resolves true if something new came back. */
export async function measureLetters(letters: string[]): Promise<boolean> {
	const missing = [...new Set(letters)].filter(letter => !widths.has(letter))
	if (!missing.length) return false
	const result = await call<Record<string, number>>('measure', [missing])
	for (const [letter, width] of Object.entries(result ?? {})) widths.set(letter, Number(width))
	return true
}
