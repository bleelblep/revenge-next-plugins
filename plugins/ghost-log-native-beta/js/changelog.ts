import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every public version gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
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
