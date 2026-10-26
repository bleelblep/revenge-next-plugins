import * as React from 'react'

/**
 * Saved stickers and hidden characters, in the plugin's jsonStorage.
 *
 * Both are arrays and always written whole: `jsonStorage.set()` replaces arrays rather than merging
 * them, so a deleted sticker or an unhidden character stays that way.
 */

/** One sticker's text. See lib/design.ts for what each number means. */
export interface StickerDesign {
	/** 2 = x/y are the middle of the text. Designs saved by 0.1.x have none; see `upgrade`. */
	v?: 2
	text: string
	x: number
	y: number
	rotate: number
	size: number
	/** Gap between lines, percent of the font size. */
	lineSpacing: number
	/** -100..100, 0 = straight. */
	bend: number
	/** The picture behind the text: percent of its fitted size, and offset in sticker pixels. */
	imageScale: number
	imageX: number
	imageY: number
}

export interface SavedSticker extends StickerDesign {
	id: string
	/** The picture on st.ayaka.one; finds the character again for Edit. */
	img: string
	color: string
	name: string
	/** The kept PNG (native `keep`): shown in Saved, copied fresh (`reuse`) for each send. */
	path: string
	savedAt: number
}

export interface SekaiStorage {
	saved: SavedSticker[]
	/** Character keys (`airi`, `Miku`...) left out of the grid. */
	hidden: string[]
}

export const DEFAULTS: SekaiStorage = { saved: [], hidden: [] }

type Storage = RevengeJsonStorageApi<SekaiStorage>
let storage: Storage | undefined

export function setStorage(value: Storage) {
	storage = value
}

export function settings(): SekaiStorage {
	return { ...DEFAULTS, ...(storage?.cache ?? {}) }
}

export function update(patch: Partial<SekaiStorage>) {
	storage?.set(patch)
}

/** The settings, re-rendering on any change. Call like a hook. */
export function useSettings(): SekaiStorage {
	const [, redraw] = React.useReducer((n: number) => n + 1, 0)
	const handle = storage
	React.useEffect(() => {
		try {
			return handle?.subscribe?.(() => redraw())
		} catch {
			return undefined
		}
	}, [handle])
	return { ...DEFAULTS, ...(handle?.cache ?? {}) }
}
