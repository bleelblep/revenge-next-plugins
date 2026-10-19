import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every public version gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.8.8',
		date: '2026-10-18',
		title: 'Log your own messages',
		changes: [
			'New in Options: Include my own deleted messages. It used to be a switch on the Debug page, which normal builds no longer have.',
			'Include my own edits is still in Options, under Log edits.',
		],
	},
	{
		version: '0.8.7',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.8.6',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.8.5',
		date: '2026-10-11',
		title: "What's new shows just the newest version",
		changes: ['The update popup shows the latest change only, not every version since the last one you saw.'],
	},
	{
		version: '0.8.4',
		date: '2026-10-11',
		title: 'Toasts fixed for the new toast system',
		changes: [
			'Toasts now use the shape Discord 350.2 renders. The old shape was silently dropped and could crash the app in its toast container.',
		],
	},
	{
		version: '0.8.3',
		date: '2026-10-09',
		title: 'Vector fix',
		changes: [
			'Works on JingMatrix Vector and LSPosed with API obfuscation, where it failed to load.',
		],
	},
	{
		version: '0.8.2',
		date: '2026-10-08',
		title: 'Recovers the log after the Revenge update',
		changes: [
			'Revenge 1.7 moved where plugins keep their files and left the old log behind. On the first start it is merged back in: nothing is replaced, and catches since the update are kept.',
			'Your settings from before the update come back too, so an unlimited log is no longer cut to 100 entries.',
		],
	},
	{
		version: '0.8.1',
		date: '2026-10-07',
		title: 'Media opens from the log',
		changes: [
			"Saved images and videos open from the log even if you haven't opened any media in chat yet.",
			"If something still can't open, the message now says why.",
		],
	},
	{
		version: '0.8.0',
		date: '2026-10-07',
		title: 'A fresh look',
		changes: [
			'Deleted and edited messages now look like Discord messages, grouped by channel like search results.',
			'Search, and filters for servers, DMs and messages with media.',
			"Saved images and videos show in the log. Tap one to open it in Discord's viewer.",
			'New Deleted media page: every saved image, video and file in a grid.',
			'Long-press a message to jump to it, copy it, see who sent it, or remove it from the log.',
			'Pull down to refresh. The settings page is tidied into groups.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-10-07',
		title: 'A sturdier way to keep deletions',
		changes: [
			'Deleted messages now stay on screen by holding the delete back, instead of faking an edit. The fake edit is what crashed the app before.',
			'The red marking and the reply/react block no longer drop off a deleted message when Discord refreshes it.',
			'Fewer hooks on the chat, so less to go wrong when Discord updates.',
		],
	},
	{
		version: '0.6.1',
		date: '2026-10-07',
		title: 'Steadier under load',
		changes: [
			'Dismissing an "Only you can see this" message no longer keeps it in red or logs it.',
			'Messages from a bulk delete come back straight away, not after their media finishes saving.',
			'Saved images and videos show for new deletions without needing a reload.',
			'Reacting to a deleted message restored after a reload is refused, like replying already was.',
			'Mass deletions do far less disk work, so the app stays responsive during a purge.',
			'Saved media and embeds for messages that have left the log are cleaned up on start.',
		],
	},
	{
		version: '0.6.0',
		date: '2026-10-03',
		title: 'Edit history',
		changes: [
			'Edited messages: earlier versions are kept, shown above the message in chat, and listed on a new Edited messages page.',
			'Fixed a crash when a deleted message mentioned someone.',
			'Saved images and embeds no longer go missing from older deletions.',
			'Saved videos no longer get corrupted, and now play from the saved copy.',
			'Repair Media downloads a damaged saved file again while Discord still has it.',
			'Backups include edit history.',
			'The log pages look right on light themes.',
		],
	},
	{
		version: '0.5.0-beta6',
		date: '2026-09-24',
		title: 'Reload when enabled',
		changes: [
			'Turning the plugin on mid-session asks for a reload instead of half-working.',
			'Credits for the deleted-message styling, with its licence.',
		],
	},
	{
		version: '0.5.0-beta5',
		date: '2026-09-22',
		title: 'Discord 348',
		changes: ['Icons that Discord 348 removed are no longer used.'],
	},
	{
		version: '0.5.0-beta4',
		date: '2026-09-19',
		title: 'No replies to deleted messages',
		changes: [
			'Replying or reacting to a deleted message is refused with a short explanation, instead of failing.',
		],
	},
	{
		version: '0.5.0-beta3',
		date: '2026-09-16',
		title: 'Crash fixes',
		changes: [
			'Fixed crashes on Discord 347.',
			'Restored messages come back after a reload again.',
		],
	},
]
