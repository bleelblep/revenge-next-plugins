import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.5.11',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: ['Keep Translate inside the message menu on Discord builds with unnamed components, instead of beneath the status bar.'],
	},
	{
		version: '0.5.10',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.5.9',
		date: '2026-10-02',
		title: 'Language field',
		changes: [
			'The language code field sits in a row like the rest of the settings.',
		],
	},
	{
		version: '0.5.7',
		date: '2026-09-27',
		title: 'No more closing',
		changes: [
			'Long-pressing a message no longer closes Discord.',
		],
	},
	{
		version: '0.5.4',
		date: '2026-09-24',
		title: 'Menu fix',
		changes: [
			'The Translate row has round corners like the rest of the menu again.',
		],
	},
	{
		version: '0.5.2',
		date: '2026-09-22',
		title: 'Right message',
		changes: [
			'Long-press translates the message you pressed.',
		],
	},
	{
		version: '0.5.1',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Translate a message in place with a long-press, and back again.',
			'Google, Bing, Yandex and MyMemory, no key needed.',
		],
	},
]
