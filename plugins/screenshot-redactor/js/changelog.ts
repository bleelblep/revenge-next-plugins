import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.19.9',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: ['Keep the redaction toggle inside the message menu and remove the fallback that could place it beneath the status bar.'],
	},
	{
		version: '0.19.8',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.19.7',
		title: 'Shorter description',
		changes: [
			'A shorter description that points newer Discord versions to Screenshot Redactor.',
		],
	},
	{
		version: '0.19.1',
		date: '2026-08-02',
		title: 'Mentions and headers',
		changes: [
			'@mentions, the DM header avatar, and a notice when a reload is needed.',
		],
	},
	{
		version: '0.18.5',
		date: '2026-08-01',
		title: 'DM headers',
		changes: [
			'DM headers, server tags and better name matching.',
		],
	},
]
