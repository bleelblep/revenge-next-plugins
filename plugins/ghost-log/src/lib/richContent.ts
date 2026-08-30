import type { DeletedRichContent, GhostLogStorage } from "../types"

const PLUGIN_ID = "bleelblep.ghost-log"
const INDEX_FILE = "deleted-embeds.index.v1.json"

type RichFile = {
	version: 1
	entries: DeletedRichContent[]
}

type RichIndex = {
	version: 1
	file: number
}

function path(name: string) {
	return `${revenge.plugins.constants.pluginStorageDirFor(PLUGIN_ID)}/${name}`
}

function shardPath(file: number) {
	return path(`deleted-embeds-${String(file).padStart(5, "0")}.json`)
}

function validEntry(value: any): value is DeletedRichContent {
	return Boolean(
		value &&
		typeof value.messageId === "string" &&
		typeof value.channelId === "string" &&
		typeof value.deletedAt === "number",
	)
}

function normalize(value: any): RichFile {
	const entries = Array.isArray(value?.entries) ? value.entries.filter(validEntry) : []
	return { version: 1, entries }
}

function normalizeIndex(value: any): RichIndex {
	return {
		version: 1,
		file: Number.isInteger(value?.file) && value.file > 0 ? value.file : 1,
	}
}

let writeChain: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
	const next = writeChain.then(task, task)
	writeChain = next.catch(() => {})
	return next
}

function extractEmbeds(message: any): unknown[] | undefined {
	if (!Array.isArray(message?.embeds) || message.embeds.length === 0) return undefined
	return message.embeds.map((embed: any) => {
		try {
			return JSON.parse(JSON.stringify(embed))
		} catch {
			return { description: String(embed?.description ?? "") }
		}
	})
}

function extractAttachments(message: any): DeletedRichContent["attachments"] {
	if (!Array.isArray(message?.attachments) || message.attachments.length === 0) return undefined
	const attachments = message.attachments
		.map((a: any) => ({
			filename: String(a?.filename ?? "attachment"),
			url: String(a?.url ?? a?.proxy_url ?? ""),
		}))
		.filter((a: { url: string }) => a.url)
	return attachments.length ? attachments : undefined
}

export function saveRichContent(
	message: any,
	messageId: string,
	channelId: string,
	deletedAt: number,
	settings: Pick<GhostLogStorage, "maxEntries" | "unlimitedEntries" | "saveEmbeds" | "embedsPerFile">,
) {
	if (!settings.saveEmbeds) return
	const embeds = extractEmbeds(message)
	const attachments = extractAttachments(message)
	if (!embeds && !attachments) return

	void serialize(async () => {
		try {
			const fs = revenge.modules.native.fs
			const indexPath = path(INDEX_FILE)
			const index = (await fs.exists(indexPath))
				? normalizeIndex(JSON.parse(await fs.readFile(indexPath)))
				: { version: 1, file: 1 }
			let file = index.file
			let target = shardPath(file)
			let existing = (await fs.exists(target))
				? normalize(JSON.parse(await fs.readFile(target)))
				: { version: 1, entries: [] }
			if (existing.entries.length >= settings.embedsPerFile) {
				file += 1
				target = shardPath(file)
				existing = { version: 1, entries: [] }
			}
			const next: DeletedRichContent = { messageId, channelId, deletedAt, attachments, embeds }
			const entries = [next, ...existing.entries.filter(entry => entry.messageId !== messageId)]
			await fs.writeFile(target, JSON.stringify({ version: 1, entries: entries.slice(0, settings.embedsPerFile) }))
			if (file !== index.file) await fs.writeFile(indexPath, JSON.stringify({ version: 1, file }))
		} catch (error) {
			console.error("[GhostLog] Failed to save deleted embeds:", error)
		}
	})
}
