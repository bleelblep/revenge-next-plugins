import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.1.1',
		date: '2026-10-21',
		title: 'Discord version limit',
		changes: ["Only starts on Discord 351.6 or older, so a newer Discord build can't break it."],
	},
	{
		version: '0.1.0',
		date: '2026-10-13',
		title: 'Ask AI',
		changes: [
			'Type /ai and your question for an answer only you can see. Maths, facts, explanations, help with anything.',
			'/ai help shows how to use it. Nothing is ever posted to the channel.',
		],
	},
]
