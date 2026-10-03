import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.7.8',
		date: '2026-10-03',
		title: 'Settings placement',
		changes: [
			"Plugin Hub sits below Cloud Backup in Discord's settings when both are installed.",
		],
	},
	{
		version: '0.7.7',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.7.6',
		date: '2026-10-03',
		title: 'Own settings section',
		changes: [
			'Plugin Hub has its own section in Discord\'s settings.',
			'AI Core info on the AI Hub, and groups you can collapse.',
		],
	},
	{
		version: '0.7.0',
		date: '2026-09-27',
		title: 'Plugin Doctor moved out',
		changes: [
			'Plugin Doctor became its own plugin, Diagnostics.',
		],
	},
	{
		version: '0.5.1',
		date: '2026-09-26',
		title: 'Plugin Doctor',
		changes: [
			'Plugin Doctor, and plugins with optional AI show on both hubs.',
		],
	},
	{
		version: '0.2.6',
		date: '2026-09-22',
		title: 'Hub and AI Hub',
		changes: [
			'Hub and AI Hub rows in their own section below Revenge.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Shortcuts into the plugins you choose, in four layouts.',
		],
	},
]
