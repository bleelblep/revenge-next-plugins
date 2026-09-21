/**
 * The command itself: read, summarise, show.
 *
 * Every failure is reported into the channel as a clientside message rather than swallowed. A
 * summariser that silently does nothing when the store is empty or the budget is spent is
 * indistinguishable from one that is broken, and the user has no log to check.
 */

import { backfill } from './backfill'
import { showClientMessage } from './clientMessage'
import { argument, OptionType, registerCommand } from './commands'
import { debug, settings, toast } from './state'
import { summarise } from './summarise'
import { buildTranscript, channelLabel } from './transcript'
import type { CommandArgument, CommandContext } from './commands'

/** Below this there is nothing worth paying to summarise. */
const MIN_MESSAGES = 5

function report(channelId: string, content: string) {
	if (!showClientMessage({ channelId, content })) {
		// The clientside message is the whole output, so if it cannot be shown the toast is the
		// only way the user learns anything happened at all.
		toast(content.slice(0, 120))
	}
}

async function run(args: CommandArgument[], context: CommandContext) {
	const channelId = context?.channel?.id
	if (!channelId) {
		toast('Catch Up could not tell which channel this is')
		return
	}

	const s = settings()
	const requested = argument<number>(args, 'count', s.defaultCount)
	const count = Math.min(
		Math.max(1, Math.floor(requested) || s.defaultCount),
		s.maxCount,
	)

	if (s.announce) toast(`Loading the last ${count} messages…`)

	// Ask Discord for anything that was never on screen. Over-fetch a little: `count` is in
	// usable messages and the store counts raw ones, and bots and system notices come out later.
	const fetched = await backfill(channelId, Math.ceil(count * 1.4))

	const transcript = buildTranscript(channelId, count, s.skipBots)
	debug(
		`${transcript.available} usable messages loaded, summarising ${transcript.lines.length}`,
	)

	if (transcript.available === 0) {
		report(
			channelId,
			"Nothing to catch up on — Discord hasn't loaded any messages for this channel yet. Scroll up once and try again.",
		)
		return
	}

	if (transcript.lines.length < MIN_MESSAGES) {
		report(
			channelId,
			`Only ${transcript.lines.length} message${transcript.lines.length === 1 ? '' : 's'} to read here. Not worth a summary — just scroll up.`,
		)
		return
	}

	const result = await summarise(transcript)
	if (result.problem) {
		report(channelId, result.problem)
		return
	}

	// Say plainly when the channel could not supply what was asked for. "27 of the 100 you asked
	// for" is a fact the reader can act on; a bare "27 messages" looks like a bug.
	const got = transcript.lines.length
	const scope =
		got >= count
			? `last ${got} messages`
			: fetched.unavailable
				? `${got} messages — only what was already loaded`
				: fetched.exhausted
					? `${got} of the ${count} asked for — the channel has no more history`
					: `${got} of the ${count} asked for — stopped fetching to keep it quick`

	report(
		channelId,
		`**Catch-up · ${channelLabel(channelId)}** _(${scope})_\n\n${result.text}`,
	)
}

export function installCommand(): () => void {
	return registerCommand({
		name: 'catchup',
		description:
			'Summarise what you missed in this channel. Only you see the result.',
		options: [
			{
				name: 'count',
				description:
					'How many recent messages to read. Defaults to your setting.',
				type: OptionType.Integer,
				required: false,
			},
		],
		execute: (args, context) => {
			// Deliberately not awaited: Discord's command dispatch does not want a promise, and
			// the summary arrives as its own message whenever it is ready.
			run(args, context).catch(error => {
				console.error('[CatchUp] /catchup failed:', error)
				const channelId = context?.channel?.id
				if (channelId)
					report(channelId, 'Catch Up hit an error. See the debug log.')
			})
		},
	})
}
