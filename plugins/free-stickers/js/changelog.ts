import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.8',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '0.1.7',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '0.1.6',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.5',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '0.1.4',
		date: '2026-10-13',
		title: 'Discord 350.4',
		changes: ['Pop-up messages work on Discord 350.4. Before, showing one could crash Discord.'],
	},
	{
		version: '0.1.3',
		date: '2026-10-04',
		title: 'Fix',
		changes: [
			'No more "could not replace canUseCustomStickersEverywhere" error on newer Discord versions.',
		],
	},
	{
		version: '0.1.2',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-02',
		title: 'Animated stickers',
		changes: [
			'Animated stickers you can\'t send are converted to GIFs and uploaded.',
			'An option to send every sticker as a link.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-30',
		title: 'First release',
		changes: [
			'Send any sticker without Nitro; locked ones go as an image link.',
		],
	},
]
