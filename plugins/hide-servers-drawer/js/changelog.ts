import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.6.9',
		date: '2026-10-04',
		title: 'Discord 349.5',
		changes: [
			'Hiding servers works again on Discord 349.5. Older versions keep working.',
		],
	},
	{
		version: '1.6.8',
		date: '2026-10-03',
		title: 'Reload prompt',
		changes: [
			"Reload Discord in the Developer section now opens Revenge's own Reload Required prompt.",
		],
	},
	{
		version: '1.6.6',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.6.5',
		date: '2026-10-02',
		title: 'Shorter description',
		changes: [
			'A shorter description.',
		],
	},
	{
		version: '1.6.4',
		date: '2026-09-27',
		title: 'Settings icons',
		changes: [
			'The settings rows have the right icons.',
		],
	},
	{
		version: '1.6.3',
		date: '2026-09-24',
		title: 'Theme colours',
		changes: [
			'Colours follow your theme instead of falling back to fixed ones.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Hide servers or whole folders from your server list, only on your device.',
		],
	},
]
