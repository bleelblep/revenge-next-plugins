import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.5',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-09-29',
		title: 'Floating counter',
		changes: [
			'The count sits in a small square above the message box, on the side you choose.',
			'Turns red with how far over the limit you are.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-29',
		title: 'First release',
		changes: [
			'Shows how many characters your message has.',
		],
	},
]
