/**
 * One plugin pinned to the hub.
 *
 * A snapshot, not a reference. The name and icon are copied at the moment it is added, because
 * reading the live plugin list needs Revenge's Developer Mode (see `lib/installed.ts`), and the
 * hub has to keep working after that is switched back off. Opening an entry only needs its id:
 * Revenge registers every running plugin's settings page as a route named after the plugin.
 */
export interface Entry {
	id: string
	name: string
	icon?: string
	/** Depends on AI Core, or is AI Core. Listed on the AI Hub page instead of the Hub. */
	ai: boolean
	/** The manifest's one-liner, for the Cards layout. Missing on entries added before 0.2.0. */
	description?: string
	/** Shown as a big tile at the top of the Favourites layout. At most four per page are used. */
	favourite?: boolean
}

export type Layout = 'favourites' | 'grid' | 'cards' | 'shelves'

export interface HubStorage {
	/**
	 * In display order. Stored as an array and always written whole: `jsonStorage.set()`
	 * replaces arrays rather than merging them, so removing an entry sticks (porting rule 6
	 * only bites keyed objects).
	 */
	entries: Entry[]
	layout: Layout
}
