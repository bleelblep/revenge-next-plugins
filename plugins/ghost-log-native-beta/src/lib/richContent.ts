import type { GhostLogSettings } from '../types'

const PLUGIN_ID = 'bleelblep.ghost-log-native-beta'
const INDEX_FILE = 'deleted-embeds.index.v1.json'

interface RichEntry {
	messageId: string
	channelId: string
	deletedAt: number
	attachments?: { filename: string; url: string }[]
	embeds?: unknown[]
}

function path(name: string) {
	return `${revenge.plugins.constants.pluginStorageDirFor(PLUGIN_ID)}/${name}`
}

function shardPath(file: number) {
	return path(`deleted-embeds-${String(file).padStart(5, '0')}.json`)
}

function clone(value: any): any {
	try {
		return JSON.parse(JSON.stringify(value))
	} catch {
		return { description: String(value?.description ?? '') }
	}
}

function rich(message: any): Pick<RichEntry, 'attachments' | 'embeds'> {
	const embeds = Array.isArray(message?.embeds) && message.embeds.length
		? message.embeds.map(clone)
		: undefined
	const attachments = Array.isArray(message?.attachments)
		? message.attachments
				.map((a: any) => ({ filename: String(a?.filename ?? 'attachment'), url: String(a?.url ?? a?.proxy_url ?? '') }))
				.filter((a: { url: string }) => a.url)
		: undefined
	return { embeds, attachments: attachments?.length ? attachments : undefined }
}

let writeChain: Promise<unknown> = Promise.resolve()
function serialize<T>(task: () => Promise<T>): Promise<T> {
	const next = writeChain.then(task, task)
	writeChain = next.catch(() => {})
	return next
}

export function saveRichContent(
	message: any,
	messageId: string,
	channelId: string,
	deletedAt: number,
	settings: Pick<GhostLogSettings, 'saveEmbeds' | 'embedsPerFile'>,
) {
	if (!settings.saveEmbeds) return
	const content = rich(message)
	if (!content.embeds && !content.attachments) return

	void serialize(async () => {
		try {
			const fs = revenge.modules.native.fs
			const indexPath = path(INDEX_FILE)
			const index = await fs.exists(indexPath)
				? JSON.parse(await fs.readFile(indexPath))
				: { version: 1, file: 1 }
			let file = Number.isInteger(index?.file) && index.file > 0 ? index.file : 1
			let target = shardPath(file)
			let existing = await fs.exists(target) ? JSON.parse(await fs.readFile(target)) : { version: 1, entries: [] }
			if (!Array.isArray(existing?.entries)) existing = { version: 1, entries: [] }
			if (existing.entries.length >= settings.embedsPerFile) {
				file += 1
				target = shardPath(file)
				existing = { version: 1, entries: [] }
			}
			const entry: RichEntry = { messageId, channelId, deletedAt, ...content }
			const entries = [entry, ...existing.entries.filter((e: RichEntry) => e.messageId !== messageId)]
			await fs.writeFile(target, JSON.stringify({ version: 1, entries: entries.slice(0, settings.embedsPerFile) }))
			if (file !== index.file) await fs.writeFile(indexPath, JSON.stringify({ version: 1, file }))
		} catch (error) {
			console.error('[GhostLogNativeBeta] Failed to save deleted embeds:', error)
		}
	})
}
