import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '1.3.5',
		date: '2026-10-23',
		title: 'Discord version limit removed',
		changes: ['Installs on any Discord version again.'],
	},
	{
		version: '1.3.4',
		date: '2026-10-22',
		title: 'Discord 352.2',
		changes: ['Also starts on Discord 352.2 (was 351.6 or older).'],
	},
	{
		version: '1.3.3',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '1.3.2',
		date: '2026-10-13',
		title: 'Tidy-up',
		changes: ['Errors now show in the Revenge plugin list instead of only the log, and the developer Debug page is gone from normal builds.'],
	},
	{
		version: '1.3.1',
		date: '2026-10-03',
		title: 'Reliable hiding',
		changes: [
			'Fixed call buttons not hiding on every screen they appear.',
			'New "Friends list" switch in the settings.',
			'Each screen recognises its own buttons, so a Discord update is less likely to bring one back.',
			'Thanks to @kmmiio99o for this update.',
		],
	},
	{
		version: '1.2.7',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '1.2.6',
		date: '2026-09-27',
		title: 'No more crashes',
		changes: [
			'A button Discord has moved or removed no longer crashes the app.',
		],
	},
	{
		version: '1.2.2',
		date: '2026-08-04',
		title: 'Cleaner DMs',
		changes: ['The whole button is removed in DMs, not just its icon.'],
	},
	{
		version: '1.2.1',
		date: '2026-08-03',
		title: 'Smarter detection',
		changes: [
			'Call and video buttons are found by their icon, not their position.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-07-31',
		title: 'First Revenge Next release',
		changes: [
			'Hides call and video buttons from DMs, profiles and voice channels.',
		],
	},
]
