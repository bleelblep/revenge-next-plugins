/**
 * Sending an animated PNG sticker so it moves: the native half turns it into a GIF file
 * (`toGif`, cached by sticker and size), and this uploads that file as an image attachment,
 * the way a picture from the gallery is sent.
 *
 * The upload is a plain multipart POST to the messages endpoint with the account's own token,
 * because Revenge's file bridge can only write text and Discord's upload queue wants a picker
 * result. React Native's fetch sends a `{ uri, name, type }` FormData part straight from disk.
 */

import { TAG } from './state'

function token(): string | undefined {
	try {
		const stores = revenge.discord.flux.Stores as any
		const auth = stores?.AuthenticationStore ?? stores?.AuthStore
		const value = auth?.getToken?.()
		return typeof value === 'string' && value ? value : undefined
	} catch {
		return undefined
	}
}

export function toGif(stickerId: string, url: string, size: number): Promise<string> {
	return (revenge.modules.native as any).callNativeMethod('bleelblep.free-stickers.toGif', [stickerId, url, size])
}

/** Discord's reply target, from `sendStickers`' options, in the shape the REST API wants. */
function replyReference(options: any, channelId: string) {
	const ref = options?.messageReference
	if (!ref?.message_id && !ref?.messageId) return undefined
	return {
		message_id: ref.message_id ?? ref.messageId,
		channel_id: ref.channel_id ?? ref.channelId ?? channelId,
		guild_id: ref.guild_id ?? ref.guildId,
		fail_if_not_exists: false,
	}
}

export async function uploadGif(channelId: string, path: string, name: string, options: unknown): Promise<void> {
	const auth = token()
	if (!auth) throw new Error("Discord's sign-in token wasn't found")

	const body = new FormData()
	const reference = replyReference(options, channelId)
	body.append(
		'payload_json',
		JSON.stringify({
			content: '',
			nonce: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
			attachments: [{ id: 0, filename: `${name}.gif` }],
			...(reference ? { message_reference: reference } : {}),
		}),
	)
	body.append('files[0]', { uri: `file://${path}`, name: `${name}.gif`, type: 'image/gif' } as any)

	const response = await fetch(`https://discord.com/api/v9/channels/${channelId}/messages`, {
		method: 'POST',
		headers: { Authorization: auth },
		body,
	})
	if (!response.ok) {
		let detail = ''
		try {
			detail = (await response.text()).slice(0, 200)
		} catch {
			/* no body */
		}
		console.error(`${TAG} upload failed:`, response.status, detail)
		throw new Error(response.status === 403 ? "You can't attach files here" : `Upload failed (${response.status})`)
	}
}
