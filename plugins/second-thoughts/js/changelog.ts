import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.3.3',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.3.2',
		date: '2026-10-02',
		title: 'Try a draft',
		changes: [
			'The Try a draft field sits in a row like the rest of the settings.',
		],
	},
	{
		version: '0.3.1',
		date: '2026-09-28',
		title: 'Skip DMs',
		changes: [
			'A switch to skip every check in DMs.',
			'A send that fails after the check puts your draft back instead of losing it.',
		],
	},
	{
		version: '0.2.8',
		date: '2026-09-27',
		title: 'Settings icons',
		changes: [
			'The settings rows have the right icons.',
		],
	},
	{
		version: '0.2.7',
		date: '2026-09-26',
		title: 'Works with fake-nitro',
		changes: [
			'Sending no longer fails alongside fake-nitro.',
		],
	},
	{
		version: '0.2.3',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Free, local checks for passwords, keys and personal details before a message sends.',
			'Optional AI checks for anger, drunk-posting and oversharing with AI Core.',
		],
	},
]
