import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.2',
		date: '2026-10-09',
		title: 'Vector fix',
		changes: [
			'Works on JingMatrix Vector and LSPosed with API obfuscation, where it failed to load.',
		],
	},
	{
		version: '0.1.1',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-10-01',
		title: 'First release',
		changes: [
			'Bold, italics, code, spoilers and more are styled as you type.',
		],
	},
]
