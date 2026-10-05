import { callNativeMethod } from './native'

const ID = 'bleelblep.ghost-log-native-beta'
const TAG = '[GhostLogNativeBeta]'

/** One earlier version of a message: its text, and when an edit replaced it. */
export interface EditVersion {
	content: string
	editedAt: number
}

/** Everything known about one edited message. Mirrors the native record exactly. */
export interface EditRecord {
	id: string
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	authorAvatar?: string
	guildIcon?: string
	sentAt?: number
	/** Oldest first. The current text is not in here -- see `current`. */
	versions: EditVersion[]
	current: string
	/** When the latest edit happened. */
	editedAt: number
}

/** What JS hands native for one edit; native merges it into the message's record. */
export interface EditCapture {
	id: string
	channelId: string
	guildId?: string
	authorId: string
	authorName: string
	channelName: string
	guildName?: string
	authorAvatar?: string
	guildIcon?: string
	sentAt?: number
	previous: string
	current: string
	editedAt: number
}

// The native encrypted store is the source of truth; this mirrors it for the render path, which
// runs per row per frame and needs an O(1) lookup by message id. Pages read the ordered list.
const byId = new Map<string, EditRecord>()
let ordered: EditRecord[] = []
let loading = false
const listeners = new Set<() => void>()

function rebuildOrder() {
	ordered = [...byId.values()].sort((a, b) => b.editedAt - a.editedAt)
}

function notify() {
	for (const fn of listeners) fn()
}

export function subscribeEdits(fn: () => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}

/** The record for one message, or undefined. Cheap enough for the row renderer. */
export function getEditRecord(messageId: string): EditRecord | undefined {
	return byId.get(messageId)
}

export function getEdits(): EditRecord[] {
	return ordered
}

export async function refreshEdits(): Promise<EditRecord[]> {
	if (loading) return ordered
	loading = true
	try {
		const raw = await callNativeMethod(`${ID}.getEdits`, [])
		const records = raw ? (JSON.parse(raw) as EditRecord[]) : []
		byId.clear()
		for (const record of records) if (record?.id) byId.set(record.id, record)
		rebuildOrder()
	} catch (error) {
		console.error(`${TAG} getEdits failed:`, error)
	} finally {
		loading = false
		notify()
	}
	return ordered
}

/**
 * Records one edit. The JS copy is updated at once, the same way native will merge it, so the row
 * Discord redraws for this very update already shows the earlier version. Native's merged record
 * then replaces the guess.
 */
export function captureEdit(edit: EditCapture) {
	const existing = byId.get(edit.id)
	const versions = [...(existing?.versions ?? [])]
	const last = versions[versions.length - 1]?.content
	if (edit.previous !== last && edit.previous !== edit.current) {
		versions.push({ content: edit.previous, editedAt: edit.editedAt })
	}
	const { previous: _previous, current, ...meta } = edit
	byId.set(edit.id, {
		...meta,
		...(existing ?? {}),
		versions: versions.slice(-20),
		current,
		editedAt: edit.editedAt,
	})
	rebuildOrder()
	notify()

	callNativeMethod(`${ID}.captureEdit`, [edit as unknown as Record<string, unknown>])
		.then(raw => {
			if (!raw) return
			const merged = JSON.parse(raw) as EditRecord
			if (merged?.id) {
				byId.set(merged.id, merged)
				rebuildOrder()
				notify()
			}
		})
		.catch(error => console.error(`${TAG} captureEdit failed:`, error))
}

export async function clearEdits(): Promise<void> {
	try {
		await callNativeMethod(`${ID}.clearEdits`, [])
	} catch (error) {
		console.error(`${TAG} clearEdits failed:`, error)
	}
	byId.clear()
	ordered = []
	notify()
}

/** React hook: the edit list, loaded on first mount and kept current. */
export function useEdits(): EditRecord[] {
	const { React } = revenge.react
	const [records, setRecords] = React.useState<EditRecord[]>(getEdits())

	React.useEffect(() => {
		const unsub = subscribeEdits(() => setRecords(getEdits()))
		void refreshEdits()
		return unsub
	}, [])

	return records
}
