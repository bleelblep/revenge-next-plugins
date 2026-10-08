import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.8',
		date: '2026-10-09',
		title: 'The count shows on 350.2',
		changes: [
			"Fixed the count never appearing on Discord 350.2 alpha: 0.1.7 hooked the message box, but Discord's length updates still didn't reach it.",
		],
	},
	{
		version: '0.1.7',
		date: '2026-10-09',
		title: 'Works on Discord 350.2',
		changes: [
			'The counter and send-button badge work again on Discord 350.2 alpha, which rebuilt the message box. Older Discord versions still work.',
		],
	},
	{
		version: '0.1.6',
		date: '2026-10-06',
		title: 'Slider cards',
		changes: [
			'Sliders now sit on the same card background as the settings rows around them, with the current value in the row title.',
		],
	},
	{
		version: '0.1.5',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-09-29',
		title: 'Floating counter',
		changes: [
			'The count sits in a small square above the message box, on the side you choose.',
			'Turns red with how far over the limit you are.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-29',
		title: 'First release',
		changes: [
			'Shows how many characters your message has.',
		],
	},
]
