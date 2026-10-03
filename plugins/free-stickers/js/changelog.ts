import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.2',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-02',
		title: 'Animated stickers',
		changes: [
			'Animated stickers you can\'t send are converted to GIFs and uploaded.',
			'An option to send every sticker as a link.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-30',
		title: 'First release',
		changes: [
			'Send any sticker without Nitro; locked ones go as an image link.',
		],
	},
]
