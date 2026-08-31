import type { GhostLogSettings } from '../types'
import { callNativeMethod } from './native'

const PLUGIN_ID = 'bleelblep.ghost-log-native-beta'

type RichContent = {
	// Discord's renderer relies on more than a filename and CDN URL (notably
	// proxy_url and image metadata). Persist the complete attachment object so a
	// restored MessageRecord has the same shape as the deleted message.
	//
	// Image bytes are downloaded AND AES-GCM encrypted natively at capture time into a
	// media/ folder next to the portable backup. On load each image object carries
	// `localFile` (the .enc blob name) alongside the original CDN url kept as `remoteUrl`.
	// rehydrateLocalMedia() asks native to decrypt each blob into a data: URI and points
	// the live url at it, so restored messages render the saved copy even after Discord's
	// CDN link expires — and the on-disk bytes are never a plain, viewable image.
	attachments?: any[]
	embeds?: any[]
}

function clone(value: any): any {
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return { description: String(value?.description ?? '') }
	}
}

/** Native owns persistence, so the rich sidecar and encrypted text log commit together. */
export function richContentForCapture(
	message: any,
	settings: Pick<GhostLogSettings, 'saveEmbeds'>,
): RichContent | undefined {
	if (!settings.saveEmbeds) return undefined
	const embeds = Array.isArray(message?.embeds) && message.embeds.length ? message.embeds.map(clone) : undefined
	const attachments = Array.isArray(message?.attachments)
		? message.attachments
				.map(clone)
				.filter((attachment: any) => typeof attachment?.url === 'string' && attachment.url.length > 0)
		: undefined
	if (!embeds && !attachments?.length) return undefined
	return { embeds, attachments: attachments?.length ? attachments : undefined }
}

// Memoize decrypted data URIs by .enc file name so repeated restores of the same image don't
// re-decrypt (the render-restore hook can ask for the same entries many times).
const mediaUriCache = new Map<string, string>()

/** Decrypt one encrypted media blob into a data: URI via native, cached by file name. */
async function resolveMediaUri(localFile: string): Promise<string | undefined> {
	if (!localFile) return undefined
	const cached = mediaUriCache.get(localFile)
	if (cached) return cached
	try {
		const uri = await callNativeMethod(`${PLUGIN_ID}.getMedia`, [localFile])
		if (typeof uri === 'string' && uri.length) {
			mediaUriCache.set(localFile, uri)
			return uri
		}
	} catch (error) {
		console.error('[GhostLogNativeBeta] Failed to decrypt saved media:', error)
	}
	return undefined
}

/** Collect every media sub-object in a rich record that carries a saved encrypted copy. */
function mediaObjects(rich: RichContent): any[] {
	const out: any[] = []
	if (Array.isArray(rich.attachments)) for (const att of rich.attachments) if (att?.localFile) out.push(att)
	if (Array.isArray(rich.embeds)) {
		for (const embed of rich.embeds) {
			if (!embed || typeof embed !== 'object') continue
			if (embed.image?.localFile) out.push(embed.image)
			if (embed.thumbnail?.localFile) out.push(embed.thumbnail)
			if (embed.video?.localFile) out.push(embed.video)
			if (embed.author?.localFile) out.push(embed.author)
			if (embed.footer?.localFile) out.push(embed.footer)
		}
	}
	return out
}

/**
 * Point every url field a media object may have (image/thumbnail/video use url/proxy_url,
 * author/footer icons use icon_url/proxy_icon_url) at the decrypted data: URI.
 */
function applyUri(obj: any, uri: string) {
	for (const key of ['url', 'proxy_url', 'icon_url', 'proxy_icon_url']) {
		if (typeof obj[key] === 'string') obj[key] = uri
	}
}

/**
 * Rewrite every saved media reference in a rich-content record to a decrypted data: URI so restored
 * messages render the bytes we captured, not the (often-expired) CDN link. The original CDN url
 * stays available under `remoteUrl`. Media that fails to decrypt is left on its CDN url as fallback.
 */
async function rehydrateLocalMedia(rich: RichContent) {
	const objs = mediaObjects(rich)
	await Promise.all(
		objs.map(async obj => {
			const uri = await resolveMediaUri(obj.localFile)
			if (uri) applyUri(obj, uri)
		}),
	)
}

export async function loadRichContent(ids: string[]) {
	const out = new Map<string, RichContent>()
	if (!ids.length) return out
	try {
		const raw = await callNativeMethod(`${PLUGIN_ID}.getRichContent`, [ids])
		const entries = raw ? JSON.parse(raw) : {}
		const pending: Promise<void>[] = []
		for (const [id, rich] of Object.entries(entries)) {
			if (rich && typeof rich === 'object') {
				pending.push(rehydrateLocalMedia(rich as RichContent))
				out.set(id, rich as RichContent)
			}
		}
		await Promise.all(pending)
	} catch (error) {
		console.error('[GhostLogNativeBeta] Failed to load deleted embeds:', error)
	}
	return out
}
