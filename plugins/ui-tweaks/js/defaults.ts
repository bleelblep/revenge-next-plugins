/** The settings. Every tweak starts off: a tweaks plugin must not change anything until asked. */

/** A swipe stage's action (lib/actions.ts). */
export type SwipeAction = 'stock' | 'reply' | 'edit' | 'react' | 'copy' | 'mention' | 'menu' | 'unread' | 'nothing'

export interface UITweaksStorage {
	/** Hide the emoji row at the top of the message long-press sheet. */
	hideSheetEmojiRow: boolean
	/** Long-press sheet rows hidden by label; `null` is an unhidden row's tombstone. */
	hiddenSheetRows: Record<string, true | null>
	/** Long-press sheet sections hidden by position ("1" = top) or `plugin:` key; `null` is a tombstone. */
	hiddenSheetGroups: Record<string, true | null>
	/** Discord settings sections hidden by id (see lib/layout.ts); `null` is a tombstone. */
	hiddenSettingsSections: Record<string, true | null>
	/** Discord settings items hidden by key (e.g. "APP_ICONS"); `null` is a tombstone. */
	hiddenSettingsItems: Record<string, true | null>
	/**
	 * What the sheet and the settings page looked like when last seen, as JSON strings (a string,
	 * not arrays, so jsonStorage's merge can't splice old and new lists together). Listed on the
	 * settings pages so there is something to hide before the user has seen everything this session.
	 */
	sheetLayout: string
	settingsLayout: string

	/** Expression picker tabs. */
	hidePickerGifs: boolean
	hidePickerStickers: boolean

	/** Hide the quick emoji/actions bar a message tap shows. */
	hideReactionBar: boolean
	/** Double-tap a message: reply on others' messages, edit your own. Replaces the default double-tap reaction. */
	doubleTapReply: boolean
	/** Hide the Message Requests section in the DM list. */
	hideMessageRequests: boolean

	/** What a short swipe on a message does (patches/swipe.ts; `stock` = Discord's reply). */
	swipeShort: SwipeAction
	/** What the further swipe does (`stock` = Discord's edit on your messages, reply on others'). */
	swipeLong: SwipeAction
	/** Give every message the further-swipe stage, not just your own. */
	swipeAllMessages: boolean
	/** The emoji the React action uses; empty = your Discord double-tap emoji. */
	swipeEmoji: string

	/** Older shapes, folded into the current ones on start (lib/migrate.ts). */
	hideForwardRow?: boolean
	hideMentionRow?: boolean
	/** 0.3.0's per-menu shapes (rolled back in 0.3.1). */
	hiddenSheetItems?: Record<string, true | null>
	sheetLayouts?: string
}

// Also the fallback for every read: `load: true` starts the storage read without awaiting it.
export const DEFAULTS: UITweaksStorage = {
	hideSheetEmojiRow: false,
	hiddenSheetRows: {},
	hiddenSheetGroups: {},
	hiddenSettingsSections: {},
	hiddenSettingsItems: {},
	sheetLayout: '',
	settingsLayout: '',
	hidePickerGifs: false,
	hidePickerStickers: false,
	hideReactionBar: false,
	doubleTapReply: false,
	hideMessageRequests: false,
	swipeShort: 'stock',
	swipeLong: 'stock',
	swipeAllMessages: false,
	swipeEmoji: '',
}
