export interface StickerStorage {
	/** Send a link even for stickers Discord would let you send, e.g. with Nitro. */
	forceLinks: boolean
	/** Pixel size asked of Discord's media proxy. */
	size: 160 | 320
}
