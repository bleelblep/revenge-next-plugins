import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.4',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.3',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.2',
		date: '2026-10-09',
		title: 'Works on Discord 350.2',
		changes: [
			'Long-pressing a server profile picture for the main one works again on Discord 350.2 alpha. Older Discord versions still work.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-04',
		title: 'First release',
		changes: [
			'Tap a profile picture or banner to view it full size, with save and share.',
			'Long-press a server profile picture to see the main one.',
			'A settings page with the changelog.',
		],
	},
]
