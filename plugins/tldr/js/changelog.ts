import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.2.11',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.2.10',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.2.9',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.2.8',
		date: '2026-10-20',
		title: 'Better summaries',
		changes: [
			'Clearer instructions to the model, so summaries keep to a few short bullets, most of all from the on-phone model in AI Core Local.',
			'The model reads names instead of user ids.',
		],
	},
	{
		version: '0.2.7',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.2.6',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.2.5',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: ['Keep TL;DR inside the message menu on Discord builds with unnamed components, instead of beneath the status bar.'],
	},
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
