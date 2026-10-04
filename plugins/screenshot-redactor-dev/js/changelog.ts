import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.27.9',
		date: '2026-10-05',
		title: 'Menu placement and redaction refresh',
		changes: [
			'Keep the redaction toggle inside the message menu instead of beneath the status bar.',
			'Improve name restoration and refresh redaction consistently across user surfaces.',
			'Available through the regular update channel.',
		],
	},
	{
		version: '0.27.9-beta4',
		date: '2026-10-05',
		title: 'Message menu placement',
		changes: ['Keep the redaction toggle inside the message menu on Discord builds with unnamed components, instead of beneath the status bar.'],
	},
	{
		version: '0.27.9-beta3',
		date: '2026-10-04',
		title: 'Restore DM names',
		changes: [
			'Generate original chat rows with real name resolution before saving them for restoration.',
			'Redact a private outgoing row instead of the producer’s cached result, preventing saved placeholders from returning when redaction is switched off.',
		],
	},
	{
		version: '0.27.9-beta2',
		date: '2026-10-04',
		title: 'Refresh lifecycle',
		changes: [
			'Redaction settings now share one refresh subscription, including changes made outside the settings screen.',
			'Queued refreshes are coalesced and cancelled when an explicit refresh runs or the plugin stops.',
			'Corrected native forceReload handling: it refreshes views without discarding the mirrored row list.',
		],
	},
	{
		version: '0.27.9-beta1',
		date: '2026-10-04',
		title: 'Identity surfaces and refresh',
		changes: [
			'Member and reaction rows now redact at their presentation boundary, including precomputed nicknames and secondary usernames.',
			'Member rows, reaction rows, shared user avatars and unnamed group DM titles subscribe to redaction changes.',
			'Fixed missed default-export resolvers and mutations of cached reply previews and chat options; settings changes share one refresh subscription.',
		],
	},
	{
		version: '0.27.8',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.27.7',
		date: '2026-10-03',
		title: 'Group DM titles',
		changes: [
			'Group DM titles are redacted, and original names are kept so they come back.',
		],
	},
	{
		version: '0.27.0',
		date: '2026-09-22',
		title: 'Personal details',
		changes: [
			'Personal details typed into messages are redacted too.',
		],
	},
]
