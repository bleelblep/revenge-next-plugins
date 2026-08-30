import type { GhostLogSettings } from '../types'
import { callNativeMethod } from './native'

const PLUGIN_ID = 'bleelblep.ghost-log-native-beta'

type RichContent = {
	attachments?: { filename: string; url: string }[]
	embeds?: unknown[]
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
				.map((a: any) => ({ filename: String(a?.filename ?? 'attachment'), url: String(a?.url ?? a?.proxy_url ?? '') }))
				.filter((a: { url: string }) => a.url)
		: undefined
	if (!embeds && !attachments?.length) return undefined
	return { embeds, attachments: attachments?.length ? attachments : undefined }
}

export async function loadRichContent(ids: string[]) {
	const out = new Map<string, RichContent>()
	if (!ids.length) return out
	try {
		const raw = await callNativeMethod(`${PLUGIN_ID}.getRichContent`, [ids])
		const entries = raw ? JSON.parse(raw) : {}
		for (const [id, rich] of Object.entries(entries)) {
			if (rich && typeof rich === 'object') out.set(id, rich as RichContent)
		}
	} catch (error) {
		console.error('[GhostLogNativeBeta] Failed to load deleted embeds:', error)
	}
	return out
}
