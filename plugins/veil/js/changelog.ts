import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.4.8',
		date: '2026-10-09',
		title: 'Custom emoji',
		changes: [
			'Check sticker names too is now Check stickers and emoji too: a matching custom emoji, like :kekw:, goes behind its own spoiler. Tap it to see it. The rest of the message stays as it is.',
		],
	},
	{
		version: '0.4.7',
		date: '2026-10-09',
		title: 'Stickers',
		changes: [
			"Words and described rules can check sticker names too: tap one and choose Check sticker names too. A matching sticker is hidden and the message text stays.",
			'A blurred message hides its stickers as well (with Blur images and embeds on). Before, they stayed visible.',
			'Hold a message and tap Show sticker to see a hidden one.',
		],
	},
	{
		version: '0.4.5',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: ['Keep blur actions inside the message menu on Discord builds with unnamed components, instead of beneath the status bar.'],
	},
	{
		version: '0.4.4',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.4.3',
		date: '2026-10-03',
		title: 'Described rules',
		changes: [
			'Rules you describe in your own words replace checking every message with AI.',
		],
	},
	{
		version: '0.3.6',
		date: '2026-09-28',
		title: 'Tidier settings',
		changes: [
			'A shorter description and settings that match the other plugins.',
		],
	},
	{
		version: '0.3.5',
		date: '2026-09-26',
		title: 'Menu options',
		changes: [
			'Choose which blur options appear in the long-press menu.',
		],
	},
	{
		version: '0.3.3',
		date: '2026-09-24',
		title: 'First release',
		changes: [
			'Blurs messages behind Discord\'s spoiler, by word, person or channel.',
			'With AI Core, blurs a topic you describe.',
		],
	},
]
