import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.2.7',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.2.6',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.2.5',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.2.2',
		date: '2026-10-21',
		title: 'Makes room for other buttons',
		changes: [
			'The square now tells other plugins where it is, so things floating above the message box (like Read All+\'s "Mark read" pill) move out of its way instead of covering it.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-10-18',
		title: 'Splitting actually sends',
		changes: [
			'0.2.0 cut the message but Discord refused it before the plugin was asked: the message box checks the limit itself. While splitting is on, that check now allows up to the "At most" number of messages\' worth, and the plugin cuts at the real limit.',
		],
	},
	{
		version: '0.2.0',
		date: '2026-10-18',
		title: 'Split long messages',
		changes: [
			'Past the limit, a message now goes out as several instead of being refused: cut at a blank line, a line break or the end of a sentence, with code blocks closed and reopened so each part still renders as code.',
			'A wait between the parts, which you set in the settings (1 second to start with). A channel\'s slowmode is respected when it is longer.',
			'A cap on how many messages one send can become, 5 to start with. Longer than that, the message is sent as typed.',
			'Past the limit with splitting on, the square shows "N messages" in amber instead of red.',
			'If a later part fails to send, the rest goes back into the message box and a toast says so.',
		],
	},
	{
		version: '0.1.9',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
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
