import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.27.8',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.27.7',
		date: '2026-10-03',
		title: 'Group DM titles',
		changes: [
			'Group DM titles are redacted, and original names are kept so they come back.',
		],
	},
	{
		version: '0.27.0',
		date: '2026-09-22',
		title: 'Personal details',
		changes: [
			'Personal details typed into messages are redacted too.',
		],
	},
]
