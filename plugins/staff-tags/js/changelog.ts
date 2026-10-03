import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.4',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.3.3',
		date: '2026-10-02',
		title: 'Tag editor',
		changes: [
			'Tag editor fields sit in rows like the rest of the settings.',
		],
	},
	{
		version: '1.3.2',
		date: '2026-09-27',
		title: 'Works with Clyde Utils',
		changes: [
			'No crash alongside Clyde Utils.',
		],
	},
	{
		version: '1.3.1',
		date: '2026-09-24',
		title: 'Customise tags',
		changes: [
			'Change each tag\'s text, colour, gradient, icon and visibility.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Extra tags for owners, admins, mods and webhooks.',
		],
	},
]
