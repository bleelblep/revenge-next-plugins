/**
 * Free Stickers' hooks.
 *
 * 1. **Unlock the picker.** `canUseCustomStickersEverywhere` (the Nitro check), and
 *    `getStickerSendability` / `isSendableSticker` (which grey out boost-locked and other-server
 *    stickers and open the upsell on tap) all say yes.
 * 2. **Rewrite the send.** `sendStickers(channelId, stickerIds, content, options)` passes the
 *    stickers Discord would really accept through untouched, and sends each other one as a link
 *    to its image on Discord's media proxy, which embeds as the picture.
 *
 * Every hook is a plain function put in place of the method, not a `revenge.patcher` hook:
 * fake-nitro-style plugins `instead`-hook the same Nitro checks, and two `instead`s on one method
 * recurse forever (Send Tweaks `lib/wrap.ts` explains it). A plain function is a normal function
 * to whoever wraps it next.
 *
 * Modules are found by one distinctive property each, so `getModules`' shared `max` can't be spent
 * on junk matches, and every callback checks the property and catches: a throw in a finder
 * callback for an already-loaded module is a fatal crash (docs/debugging/api-contracts.md).
 *
 * The method (unlock checks, rewrite locked stickers to media links, skip Lottie) follows
 * FreeStickers by aliernfrog and FreeStickersNext; this code is our own (FreeStickersNext is
 * GPL-3.0, so none of it is copied).
 */

import { settings, TAG, toast } from './state'
import { toGif, uploadGif } from './upload'

/** Discord's sticker `format_type`. */
const FORMAT = { PNG: 1, APNG: 2, LOTTIE: 3, GIF: 4 } as const
/** Sticker `type`: standard ones (Discord's own packs) are free for everyone. */
const STANDARD = 1

/** Replaces `host[key]` with `make(original)`; the undo only restores if it's still ours. */
function replaceMethod(host: any, key: string, make: (original: (...args: any[]) => any) => (...args: any[]) => any) {
	const original = host?.[key]
	if (typeof original !== 'function') return undefined
	const wrapper = make(original)
	host[key] = wrapper
	if (host[key] !== wrapper) {
		console.error(`${TAG} could not replace ${key}`)
		return undefined
	}
	return () => {
		if (host[key] === wrapper) host[key] = original
	}
}

function stores(): any {
	return revenge.discord.flux.Stores as any
}

function hasNitro(): boolean {
	try {
		return (stores().UserStore?.getCurrentUser?.()?.premiumType ?? 0) > 0
	} catch {
		return false
	}
}

function guildOf(channelId: string): string | undefined {
	try {
		return stores().ChannelStore?.getChannel?.(channelId)?.guild_id ?? undefined
	} catch {
		return undefined
	}
}

/**
 * Would Discord have sent this sticker without us? Standard stickers always; a server's own
 * stickers in that server; anything with Nitro (the real check is patched to yes, so it can't be
 * asked). "Send every sticker as a link" makes everything go as a link.
 */
function sendsNatively(sticker: any, channelId: string): boolean {
	if (settings().forceLinks) return false
	if (sticker?.type === STANDARD) return true
	if (sticker?.guild_id && sticker.guild_id === guildOf(channelId)) return true
	return hasNitro()
}

function mediaUrl(sticker: any): string {
	const ext = sticker.format_type === FORMAT.GIF ? 'gif' : 'png'
	return `https://media.discordapp.net/stickers/${sticker.id}.${ext}?size=${settings().size}`
}

/** `[name](url)`: the name reads as the link text, the embed shows the sticker. */
function linkText(sticker: any): string {
	const name = String(sticker.name ?? 'sticker').replace(/[[\]()]/g, '')
	return `[${name || 'sticker'}](${mediaUrl(sticker)})`
}

let messageActions: any

function sendLink(channelId: string, content: string, options: unknown) {
	const send = messageActions?.sendMessage
	if (typeof send !== 'function') throw new Error("Discord's send function wasn't found")
	return send.call(
		messageActions,
		channelId,
		{ content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] },
		undefined,
		options ?? {},
	)
}

function safeName(sticker: any): string {
	return String(sticker.name ?? 'sticker').replace(/[^\w-]+/g, '_').slice(0, 40) || 'sticker'
}

/**
 * An animated PNG goes as an uploaded GIF so it moves (Discord shows APNG links as a still);
 * everything else, and any APNG whose conversion or upload fails, as a link.
 */
async function sendOne(channelId: string, sticker: any, options: unknown) {
	if (sticker.format_type === FORMAT.APNG) {
		try {
			toast('Converting animated sticker…')
			const size = settings().size
			const path = await toGif(String(sticker.id), `https://media.discordapp.net/stickers/${sticker.id}.png`, size)
			await uploadGif(channelId, path, safeName(sticker), options)
			return
		} catch (error: any) {
			if (!/not an animated PNG/.test(String(error?.message ?? error))) {
				console.error(`${TAG} animated sticker failed, sending the still:`, error)
				toast(`Sent as a still: ${error?.message ?? 'conversion failed'}`)
			}
		}
	}
	await sendLink(channelId, linkText(sticker), options)
}

function rewriteSend(original: (...args: any[]) => any) {
	return function (this: unknown, ...args: any[]) {
		try {
			const [channelId, stickerIds, content, options] = args
			if (typeof channelId !== 'string' || !Array.isArray(stickerIds)) return original.apply(this, args)

			const store = stores().StickersStore
			const stickers = stickerIds.map((id: string) => store?.getStickerById?.(id)).filter(Boolean)
			// A sticker the store doesn't know: leave the whole call to Discord.
			if (stickers.length !== stickerIds.length) return original.apply(this, args)

			const native = stickers.filter((s: any) => sendsNatively(s, channelId))
			const linked = stickers.filter((s: any) => !sendsNatively(s, channelId))
			if (!linked.length) return original.apply(this, args)

			const lottie = linked.filter((s: any) => s.format_type === FORMAT.LOTTIE)
			const sendable = linked.filter((s: any) => s.format_type !== FORMAT.LOTTIE)
			if (lottie.length) toast("Discord's animated stickers can't be sent without Nitro")

			let result: unknown
			if (native.length) result = original.call(this, channelId, native.map((s: any) => s.id), content, options)
			else if (sendable.length && typeof content === 'string' && content.trim()) {
				// The text typed alongside the sticker would otherwise be lost; it goes first.
				sendLink(channelId, content, options)
			}
			// One after another, so several stickers arrive in the order they were picked.
			;(async () => {
				for (const sticker of sendable) {
					try {
						await sendOne(channelId, sticker, options)
					} catch (error) {
						console.error(`${TAG} sticker send failed:`, error)
					}
				}
			})()
			return result ?? Promise.resolve()
		} catch (error) {
			console.error(`${TAG} sticker send rewrite failed:`, error)
			return original.apply(this, args)
		}
	}
}

export function installPatches(): () => void {
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters
	const undos: Array<() => void> = []
	const keep = (undo: (() => void) | undefined) => {
		if (undo) undos.push(undo)
	}

	const watch = (prop: string, onModule: (mod: any) => void) =>
		getModules(withProps<any>(prop), (mod: any) => {
			try {
				if (typeof mod?.[prop] === 'function') onModule(mod)
			} catch (error) {
				console.error(`${TAG} hooking ${prop} failed:`, error)
			}
		})

	const subscriptions = [
		watch('canUseCustomStickersEverywhere', mod => keep(replaceMethod(mod, 'canUseCustomStickersEverywhere', () => () => true))),
		watch('getStickerSendability', mod => {
			const sendable = mod.StickerSendability?.SENDABLE ?? 0
			keep(replaceMethod(mod, 'getStickerSendability', () => () => sendable))
			keep(replaceMethod(mod, 'isSendableSticker', () => () => true))
		}),
		watch('sendStickers', mod => keep(replaceMethod(mod, 'sendStickers', rewriteSend))),
		getModules(withProps<any>('sendMessage', 'receiveMessage'), (mod: any) => {
			if (typeof mod?.sendMessage === 'function') messageActions = mod
		}),
	]

	return () => {
		for (const unsubscribe of subscriptions) unsubscribe()
		for (const undo of undos.reverse()) undo()
		messageActions = undefined
	}
}
