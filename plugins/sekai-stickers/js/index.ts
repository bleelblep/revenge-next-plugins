/**
 * Sekai Stickers: a "Sekai" tab in the emoji / GIF / sticker picker that makes Project Sekai
 * stickers, like TheOriginalAyaka's sticker maker and Equicord's SekaiStickers, and adds them to
 * the message as an image.
 *
 * - lib/picker.ts adds the tab (three property swaps in Discord's expression picker modules).
 * - ui/Panel.tsx is the tab: Saved stickers, a sticker grid, then an editor with a live preview.
 * - SekaiStickers.kt draws the sticker (JS has no canvas) with the maker's own fonts.
 * - lib/upload.ts queues the PNG on the message box the way the photo picker does, and
 *   lib/chatInput.ts then returns to the text field.
 * - lib/store.ts keeps Saved stickers and hidden characters.
 *
 * Local-only: the character art is SEGA / Colorful Palette's and the main font is commercial.
 */

import { patchChatInput } from './lib/chatInput'
import { loadFontMetrics } from './lib/native'
import { patchPicker } from './lib/picker'
import { DEFAULTS, type SekaiStorage, setStorage } from './lib/store'
import { patchUpload } from './lib/upload'
import Panel from './ui/Panel'
import { reportError, setReporter } from '../../../shared/report'

const TAG = '[Sekai Stickers]'

function attempt(cleanup: (fn: () => void) => void, what: string, install: () => () => void) {
	try {
		cleanup(install())
	} catch (error) {
		reportError(`${TAG} ${what} failed:`, error)
	}
}

export default plugin<{ jsonStorage: SekaiStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},

	start({ cleanup, jsonStorage, plugin }) {
		// Errors go to Revenge's plugin error list (shared/report.ts), not the log.
		setReporter(plugin)
		cleanup(() => setReporter(undefined))

		setStorage(jsonStorage)
		// The editor's preview needs the font's measurements; ask before anyone opens it.
		loadFontMetrics()
		attempt(cleanup, 'upload lookup', patchUpload)
		attempt(cleanup, 'chat input lookup', patchChatInput)
		attempt(cleanup, 'picker patch', () => patchPicker(Panel))
	},
})
