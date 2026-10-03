import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.11',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.10',
		date: '2026-10-02',
		title: 'Red danger icons',
		changes: [
			'Delete and report rows have red icons.',
		],
	},
	{
		version: '0.1.8',
		date: '2026-10-02',
		title: 'Discord\'s look',
		changes: [
			'Reviews use Discord\'s own components.',
			'Reviews on bot profiles.',
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-02',
		title: 'First public release',
		changes: [
			'Read and write reviews on user profiles and servers, with voting.',
		],
	},
]
