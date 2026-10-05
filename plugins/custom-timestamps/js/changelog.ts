import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.2.6',
		date: '2026-10-04',
		title: 'Discord 349.5',
		changes: [
			'The checkmarks in the format list show again on Discord 349.5. Older versions keep working.',
		],
	},
	{
		version: '1.2.5',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.2.4',
		date: '2026-09-28',
		title: 'Tidier settings',
		changes: [
			'A shorter description and settings that match the other plugins.',
		],
	},
	{
		version: '1.2.1',
		date: '2026-08-08',
		title: 'Numeric months',
		changes: [
			'Custom formats can use numeric month tokens.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Calendar, relative, ISO 8601 or your own timestamp format.',
		],
	},
]
