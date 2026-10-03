import { patchBadge } from './lib/badge'
import { patchCounter } from './lib/counter'
import Settings from './ui/Settings'
import { CHANGELOG } from './changelog'
import { setupChangelog } from '../../../shared/changelog'

export interface CharCounterStorage {
	/** `count`: "45 characters". `limit`: "45 / 4,000 characters". `left`: "3,955 characters left". Past the limit: "N characters over the limit". */
	show: 'count' | 'limit' | 'left'
	/** Which side of the message box the square floats above. */
	side: 'left' | 'right'
	/** Only once the message reaches 90% of the limit. */
	onlyNearLimit: boolean
	/** Text size in the square, in points. 12 is Discord's small text, what 0.1.3 drew. */
	fontSize: number
}

export const FONT_SIZE = { min: 10, max: 20, default: 12 } as const

/** Also the fallback for every read: `load: true` doesn't wait for storage (porting rule 7). */
export const DEFAULTS: CharCounterStorage = {
	show: 'count',
	side: 'left',
	onlyNearLimit: false,
	fontSize: FONT_SIZE.default,
}

export default plugin<{ jsonStorage: CharCounterStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// The changelog: clock icon on the settings page, "What's new" after an update.
		cleanup(setupChangelog({ plugin, jsonStorage }, CHANGELOG))
		// Kept from subscribe, not read off `cache`: the settings page can write through another
		// handle on the same file, whose writes this handle's cache never sees. subscribe hands
		// over each patch, from any handle. Read on every render, so changes show on the next
		// keystroke without a reload.
		let current: CharCounterStorage = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
		const take = (patch: Partial<CharCounterStorage> | undefined) => {
			if (patch) current = { ...current, ...patch }
		}
		cleanup(jsonStorage.subscribe(patch => take(patch as Partial<CharCounterStorage>)))
		jsonStorage.get().then(take, () => {})
		const settings = () => current
		cleanup(patchCounter())
		cleanup(patchBadge(settings))
	},
	SettingsComponent: Settings,
})
