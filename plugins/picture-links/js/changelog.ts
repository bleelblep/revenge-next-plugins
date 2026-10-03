import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
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
