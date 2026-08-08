import { DEFAULTS } from "../defaults"
import type { DeletedMessage, GhostLogStorage } from "../types"

const PLUGIN_ID = "bleelblep.ghost-log"
const BACKUP_FILE = "deleted-messages.backup.v1.json"
const MESSAGE_PREFIX = "enc:v1"

type BackupBlob = {
	version: 1
	createdAt: number
	iv: number
	count: number
	payload: string
}

function pluginStorageDir() {
	return revenge.plugins.constants.pluginStorageDirFor(PLUGIN_ID)
}

function backupPath() {
	return `${pluginStorageDir()}/${BACKUP_FILE}`
}

function resolvePath(path: string | undefined) {
	const raw = (path ?? "").trim()
	if (!raw) return backupPath()
	const nativePaths = revenge.discord.native.FileModule.getConstants()
	const docs = nativePaths?.DocumentsDirPath ?? ""
	const cache = nativePaths?.CacheDirPath ?? ""

	if (raw.startsWith("documents/")) {
		const rel = raw.slice("documents/".length)
		return docs ? `${docs}/${rel}` : `data/user/0/app.revenge/files/${rel}`
	}

	if (raw.startsWith("cache/")) {
		const rel = raw.slice("cache/".length)
		return cache ? `${cache}/${rel}` : `data/user/0/app.revenge/cache/${rel}`
	}

	if (raw.startsWith("/")) {
		return raw
	}

	if (raw.startsWith("file://")) {
		return raw.slice(7)
	}

	return `${pluginStorageDir()}/${raw}`
}

export function describeBackupPath(path: string | undefined) {
	return resolvePath(path)
}

function nextIv(seed = 0) {
	return (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0) ^ seed) >>> 0
}

function getKeyMaterial() {
	const stores = revenge.discord.flux.Stores as any
	const userId = stores.UserStore?.getCurrentUser?.()?.id ?? ""
	const client = revenge.discord.native.ClientInfoModule.getConstants()
	return `${PLUGIN_ID}:${client.DeviceVendorID}:${client.Identifier}:${userId}`
}

function fnv1a(input: string) {
	let hash = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		hash ^= input.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return hash >>> 0
}

function nextByte(seed: { value: number }) {
	let x = seed.value || 0x9e3779b9
	x ^= x << 13
	x ^= x >>> 17
	x ^= x << 5
	seed.value = x >>> 0
	return seed.value & 0xff
}

function xorCipher(data: Uint8Array, key: string, iv: number) {
	const seed = { value: fnv1a(`${key}:${iv}`) }
	const out = new Uint8Array(data.length)
	for (let i = 0; i < data.length; i++) {
		out[i] = data[i] ^ nextByte(seed)
	}
	return out
}

function toBase64(data: Uint8Array) {
	return Buffer.from(data).toString("base64")
}

function fromBase64(data: string) {
	return new Uint8Array(Buffer.from(data, "base64"))
}

function encodeUtf8(text: string) {
	return new Uint8Array(Buffer.from(text, "utf8"))
}

function decodeUtf8(data: Uint8Array) {
	return Buffer.from(data).toString("utf8")
}

function shapeEntry(entry: any): DeletedMessage | null {
	if (!entry || typeof entry !== "object") return null
	if (typeof entry.id !== "string" || typeof entry.channelId !== "string") return null
	if (typeof entry.authorId !== "string" || typeof entry.authorName !== "string") return null
	if (typeof entry.channelName !== "string") return null
	if (typeof entry.content !== "string") return null
	if (typeof entry.sentAt !== "number" || typeof entry.deletedAt !== "number") return null

	const attachments = Array.isArray(entry.attachments)
		? entry.attachments
				.map((a: any) => ({ filename: String(a?.filename ?? "attachment"), url: String(a?.url ?? "") }))
				.filter((a: { url: string }) => a.url)
		: undefined

	return {
		id: entry.id,
		channelId: entry.channelId,
		guildId: typeof entry.guildId === "string" ? entry.guildId : undefined,
		authorId: entry.authorId,
		authorName: entry.authorName,
		channelName: entry.channelName,
		guildName: typeof entry.guildName === "string" ? entry.guildName : undefined,
		authorAvatar: typeof entry.authorAvatar === "string" ? entry.authorAvatar : undefined,
		guildIcon: typeof entry.guildIcon === "string" ? entry.guildIcon : undefined,
		content:
			typeof entry.content === "string" && entry.content.startsWith(`${MESSAGE_PREFIX}:`)
				? entry.content
				: String(entry.content).slice(0, 2000),
		attachments,
		sentAt: entry.sentAt,
		deletedAt: entry.deletedAt,
	}
}

function shapeEntries(raw: unknown): DeletedMessage[] {
	if (!Array.isArray(raw)) return []
	const seen = new Set<string>()
	const out: DeletedMessage[] = []
	for (const entry of raw) {
		const shaped = shapeEntry(entry)
		if (!shaped) continue
		if (seen.has(shaped.id)) continue
		seen.add(shaped.id)
		out.push(shaped)
	}
	out.sort((a, b) => b.deletedAt - a.deletedAt)
	return out
}

async function readBackupBlob(path?: string): Promise<BackupBlob | null> {
	const fs = revenge.modules.native.fs
	const target = resolvePath(path)
	const exists = await fs.exists(target)
	if (!exists) return null
	const raw = await fs.readFile(target)
	const parsed = JSON.parse(raw) as BackupBlob
	if (parsed?.version !== 1 || typeof parsed.payload !== "string" || typeof parsed.iv !== "number") {
		return null
	}
	return parsed
}

export async function writeEncryptedBackup(
	entries: DeletedMessage[],
	path?: string,
): Promise<{ createdAt: number; path: string } | null> {
	try {
		const fs = revenge.modules.native.fs
		const nativePaths = revenge.discord.native.FileModule.getConstants()
		console.log("[GhostLog] Backup native paths:", nativePaths)
		const iv = nextIv(entries.length << 7)
		const createdAt = Date.now()
		const targetPath = resolvePath(path)
		console.log("[GhostLog] Backup target path:", targetPath)
		const key = getKeyMaterial()
		const plain = JSON.stringify(entries)
		const cipher = xorCipher(encodeUtf8(plain), key, iv)
		const blob: BackupBlob = {
			version: 1,
			createdAt,
			iv,
			count: entries.length,
			payload: toBase64(cipher),
		}
		await fs.writeFile(targetPath, JSON.stringify(blob))
		return { createdAt, path: targetPath }
	} catch (error) {
		console.error("[GhostLog] Failed to write encrypted backup:", error)
		return null
	}
}

export function encryptMessageText(text: string): string {
	try {
		const trimmed = text.slice(0, 2000)
		const iv = nextIv(trimmed.length)
		const key = getKeyMaterial()
		const cipher = xorCipher(encodeUtf8(trimmed), key, iv)
		return `${MESSAGE_PREFIX}:${iv.toString(16)}:${toBase64(cipher)}`
	} catch {
		return text.slice(0, 2000)
	}
}

export function decryptMessageText(input: string): string {
	if (!input.startsWith(`${MESSAGE_PREFIX}:`)) return input
	try {
		const parts = input.split(":")
		if (parts.length < 4) return "(unable to decrypt)"
		const iv = Number.parseInt(parts[2], 16)
		const payload = parts.slice(3).join(":")
		if (!Number.isFinite(iv) || !payload) return "(unable to decrypt)"
		const key = getKeyMaterial()
		return decodeUtf8(xorCipher(fromBase64(payload), key, iv))
	} catch {
		return "(unable to decrypt)"
	}
}

// Writes are serialized through this chain. writeEncryptedBackup is async and was previously
// fired unawaited on every catch, so a burst of deletions put several full-file rewrites of the
// same path in flight at once, racing each other's truncate/write.
let writeChain: Promise<unknown> = Promise.resolve()

function serialize<T>(task: () => Promise<T>): Promise<T> {
	const next = writeChain.then(task, task)
	writeChain = next.catch(() => {})
	return next
}

export async function saveBackupFromStorage(
	jsonStorage: RevengeJsonStorageApi<GhostLogStorage>,
	entries?: DeletedMessage[],
	force = false,
) {
	const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
	if (!force && !settings.backupEnabled) return
	const target = entries ?? settings.log ?? []
	const result = await serialize(() => writeEncryptedBackup(target, settings.backupFilePath))
	if (!result) return null
	jsonStorage.set({ lastBackupAt: result.createdAt })
	return result
}

// Auto-backup once per burst, not once per catch. Every catch used to re-encrypt and rewrite the
// entire log: JSON.stringify of the whole array, then xorCipher, which is a per-byte JS loop over
// the result. Measured on-device at 341.8, that loop alone costs ~7ms per catch at 100 entries and
// ~16ms at 250 -- and with `unlimitedEntries` the log has no ceiling, so the per-deletion cost
// grows without bound. Deleting messages in quick succession therefore made each deletion more
// expensive than the last until the JS thread stopped keeping up. Trailing-debounce it instead, so
// a burst of N deletions costs one write rather than N.
const BACKUP_DEBOUNCE_MS = 2000
let backupTimer: ReturnType<typeof setTimeout> | undefined

export function scheduleBackup(jsonStorage: RevengeJsonStorageApi<GhostLogStorage>) {
	if (backupTimer !== undefined) return
	backupTimer = setTimeout(() => {
		backupTimer = undefined
		// Reads the log from storage at fire time, so it always writes the latest state.
		void saveBackupFromStorage(jsonStorage)
	}, BACKUP_DEBOUNCE_MS)
}

export function cancelScheduledBackup() {
	if (backupTimer === undefined) return
	clearTimeout(backupTimer)
	backupTimer = undefined
}

export async function restoreBackupIntoStorage(
	jsonStorage: RevengeJsonStorageApi<GhostLogStorage>,
	mode: "if-empty" | "merge" = "if-empty",
) {
	try {
		const settings = { ...DEFAULTS, ...(jsonStorage.cache ?? {}) }
		const blob = await readBackupBlob(settings.backupFilePath)
		if (!blob) return { restored: 0, reason: "missing" as const }

		const key = getKeyMaterial()
		const plain = decodeUtf8(xorCipher(fromBase64(blob.payload), key, blob.iv))
		const restored = shapeEntries(JSON.parse(plain))
		if (!restored.length) return { restored: 0, reason: "empty" as const }

		const current = settings.log ?? []
		if (mode === "if-empty" && current.length) return { restored: 0, reason: "not-empty" as const }

		const merged = mode === "merge" ? shapeEntries([...current, ...restored]) : restored
		const cap = settings.unlimitedEntries ? Infinity : Math.max(1, settings.maxEntries)
		const finalLog = merged.slice(0, cap)

		jsonStorage.set({
			log: finalLog,
			lastBackupAt: blob.createdAt,
		} as Partial<GhostLogStorage>)

		return { restored: finalLog.length, reason: "ok" as const }
	} catch (error) {
		console.error("[GhostLog] Failed to restore encrypted backup:", error)
		return { restored: 0, reason: "error" as const }
	}
}
