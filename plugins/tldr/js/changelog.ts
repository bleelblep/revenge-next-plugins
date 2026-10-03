import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.2.4',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.2.2',
		date: '2026-10-02',
		title: 'Number fields',
		changes: [
			'Number fields sit in rows like the rest of the settings.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-28',
		title: 'Tidier settings',
		changes: [
			'A shorter description and settings that match the other plugins.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-09-24',
		title: 'First release',
		changes: [
			'Long-press a long message for the gist.',
			'Summaries are saved, so asking again is free.',
		],
	},
]
