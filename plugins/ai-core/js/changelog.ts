import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every version users got gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '2.3.6',
		date: '2026-10-05',
		title: 'Release notes for the PR update',
		changes: ['Added the missing release notes and contributor credit for the 2.3.5 update.'],
	},
	{
		version: '2.3.5',
		date: '2026-10-05',
		title: 'Groq and reasoning models',
		changes: [
			'Added Groq to the provider picker, with its API address and a default model filled in for you.',
			'Adjusted completion-token limits and temperature handling for Groq and reasoning models, including GPT-OSS.',
			'Provider HTTP errors now include response details in the logs to help diagnose failed requests.',
			'Thanks to @everestmcarthur (Rosie Val) for PR #9: https://github.com/bleelblep/revenge-next-plugins/pull/9.',
		],
	},
	{
		version: '2.3.3',
		date: '2026-10-03',
		title: 'Changelog',
		changes: [
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '2.3.2',
		date: '2026-10-03',
		title: 'Balance and usage in AI Hub',
		changes: [
			'Plugin Hub\'s AI Hub can show your provider balance and which plugins use AI.',
			'Text fields sit in rows like the rest of the settings.',
		],
	},
	{
		version: '2.2.0',
		date: '2026-09-29',
		title: 'Provider picker',
		changes: [
			'Pick Anthropic, OpenAI, DeepSeek or OpenRouter and the address and model are filled in for you.',
			'Anthropic keys use Anthropic\'s own API directly.',
		],
	},
	{
		version: '2.1.3',
		date: '2026-09-26',
		title: 'Unlimited option',
		changes: [
			'An unlimited option for the daily cap.',
			'Dialogs look like Discord\'s.',
		],
	},
	{
		version: '2.0.2',
		date: '2026-09-24',
		title: 'Key vault',
		changes: [
			'Your API key is kept in an encrypted Android vault, so other plugins can never read it.',
			'The key only works with the address it was entered for.',
		],
	},
	{
		version: '1.2.0',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'One API key, one daily cap and one request queue shared by every plugin that uses AI.',
		],
	},
]
