import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.2.13',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.2.12',
		date: '2026-09-29',
		title: 'Adjustable timeout',
		changes: [
			'The AI timeout can be changed, and a timeout is only blamed when it actually ran out.',
		],
	},
	{
		version: '0.2.7',
		date: '2026-09-24',
		title: 'Fewer abandoned summaries',
		changes: [
			'Waits up to 45 seconds for a summary instead of giving up after 4.',
			'Works with AI Core 2.',
		],
	},
	{
		version: '0.2.5',
		date: '2026-09-22',
		title: 'Better summaries',
		changes: [
			'A new prompt, and people show up as mentions.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'/catchup summarises what you missed in a channel as a message only you see.',
			'Reaches back past the messages already loaded.',
		],
	},
]
