import type { ChangelogEntry } from '../../../shared/changelog'

/** Newest first. Every public version gets an entry; see shared/changelog.tsx. */
export const CHANGELOG: ChangelogEntry[] = [
	{
		version: '0.5.12',
		date: '2026-10-03',
		title: 'Simpler send button',
		changes: [
			'The send button menu is gone. Holding send is now only the swipe.',
			'Two switches in Settings: Message preview and Send unchanged. With one off, the other is at the top of the swipe.',
			'Changing either one asks to reload Discord, so it takes effect straight away.',
			'The clock icon at the top right of the settings shows what changed in every version.',
			'After an update, a short "What\'s new" dialog lists the changes the next time you open the settings.',
		],
	},
	{
		version: '0.5.7',
		date: '2026-10-03',
		title: 'Message preview',
		changes: [
			'Preview a message before sending it, with its formatting, in a popup that scrolls.',
			'Hold the send button and swipe up: halfway opens the preview, all the way sends unchanged.',
			'Preview is also in the long-press menu of the send button.',
		],
	},
	{
		version: '0.4.4',
		date: '2026-09-29',
		title: 'Silent sends and a send button menu',
		changes: [
			'Link tracking rules update themselves about once a week from ClearURLs.',
			'Redirect links (like Google or Facebook outbound links) are unwrapped to where they really go.',
			'Silent messages: send without notifying anyone.',
			'Long-press the send button for a menu of one-off options.',
		],
	},
	{
		version: '0.2.1',
		date: '2026-09-26',
		title: 'Link rules and AI-written rules',
		changes: [
			'Fixed editing a message failing alongside some other plugins.',
			'Link rules: rules that only run inside links, such as twitter.com to fxtwitter.com, with ready-made ones to pick from.',
			'Rules open on their own screen, and each ready-made list has its own screen.',
			'With AI Core installed, a rule can be written from a description and is tested before it is added.',
		],
	},
	{
		version: '0.1.5',
		date: '2026-09-25',
		title: 'Safer rules',
		changes: [
			'Rules can no longer break code, links, mentions, custom emoji or timestamps.',
			'Rules that match the start or end of a message work.',
			'Plain-text replacements are sent exactly as typed.',
			'Link cleaning keeps the parts of Reddit and Amazon links that change the page.',
		],
	},
	{
		version: '0.1.0',
		date: '2026-09-22',
		title: 'First release',
		changes: [
			'Removes tracking from links you send.',
			'Replies can start without pinging the person.',
			'Your own find-and-replace rules. Text in code blocks is never changed.',
		],
	},
]
