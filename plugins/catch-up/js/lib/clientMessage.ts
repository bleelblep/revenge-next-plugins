/**
 * Showing the summary without sending it.
 *
 * The result has to land in the channel you are reading, because that is where you are looking,
 * and it must never reach Discord. Both are satisfied by handing a fabricated message to the
 * client's own receive path: it renders exactly like a real one and no request is made.
 *
 * `flags: 64` is EPHEMERAL, which makes Discord render its own "Only you can see this" notice.
 * That notice is doing real work — a summary that looks like an ordinary message in a busy
 * channel is a summary somebody will eventually think everyone else can read.
 */

const EPHEMERAL = 64

/** Discord rejects ids it cannot parse as a snowflake, so this has to look like one. */
function fakeSnowflake(): string {
	// Snowflake epoch is 2015-01-01. The low 22 bits are worker/process/increment; random is fine
	// for a message that exists only in this client's store.
	const timestamp = BigInt(Date.now() - 1420070400000) << 22n
	const noise = BigInt(Math.floor(Math.random() * 4194304))
	return (timestamp | noise).toString()
}

let receiver: any
let receiverResolved = false

/**
 * Resolved lazily and cached. Never at module scope -- porting rule 1.
 */
function getReceiver(): any {
	if (receiverResolved) return receiver
	receiverResolved = true

	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const [mod, id] = lookupModule(
			withProps('receiveMessage', 'sendMessage'),
		) as [any, number | undefined]
		if (id === undefined) {
			console.error('[CatchUp] no receiveMessage module found')
			return undefined
		}
		// The export is usually on `default`, not on the namespace -- porting rule 3.
		const host = typeof mod?.receiveMessage === 'function' ? mod : mod?.default
		if (typeof host?.receiveMessage !== 'function') {
			console.error(`[CatchUp] module ${id} has no callable receiveMessage`)
			return undefined
		}
		receiver = host
		console.log(`[CatchUp] clientside messages will use module ${id}`)
	} catch (error) {
		console.error('[CatchUp] receiveMessage lookup threw:', error)
	}

	return receiver
}

export interface ClientMessageOptions {
	channelId: string
	content: string
	/** Shown as the author. Defaults to the plugin's own name. */
	author?: string
}

/** True when the message was handed to the client. Nothing is ever sent to Discord. */
export function showClientMessage({
	channelId,
	content,
	author = 'Catch Up',
}: ClientMessageOptions): boolean {
	const host = getReceiver()
	if (!host) return false

	try {
		host.receiveMessage(channelId, {
			id: fakeSnowflake(),
			type: 0,
			flags: EPHEMERAL,
			channel_id: channelId,
			content,
			author: {
				id: '1',
				username: author,
				global_name: author,
				discriminator: '0000',
				avatar: null,
				bot: true,
			},
			timestamp: new Date().toISOString(),
			edited_timestamp: null,
			tts: false,
			pinned: false,
			mention_everyone: false,
			mentions: [],
			mention_roles: [],
			attachments: [],
			embeds: [],
			reactions: [],
			state: 'SENT',
		})
		return true
	} catch (error) {
		console.error('[CatchUp] could not show the clientside message:', error)
		return false
	}
}
