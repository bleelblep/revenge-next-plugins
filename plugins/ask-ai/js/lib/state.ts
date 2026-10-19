/** Settings, the AI Core handle, and the toast. */

import { showToast } from '../../../../shared/toast'

export interface AiHandle {
	isAvailable(): boolean
	text(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<string | undefined>
	budget(): { configured: boolean; used: number; cap: number; remaining: number }
}

export interface AskAiStorage {
	/** How long answers are: short, normal or long. */
	length: 'short' | 'normal' | 'long'
	/** Quote the question above its answer. */
	showQuestion: boolean
}

export const DEFAULTS: AskAiStorage = { length: 'normal', showQuestion: true }

type Storage = RevengeJsonStorageApi<AskAiStorage>
let storage: Storage | undefined
let ai: AiHandle | undefined

export function setStorage(value: Storage | undefined) {
	storage = value
}

export function settings(): AskAiStorage {
	return { ...DEFAULTS, ...((storage as any)?.cache ?? {}) }
}

/** The settings, re-rendering on change. Call like a hook. */
export function useSettings(): AskAiStorage {
	return { ...DEFAULTS, ...(storage?.use() ?? {}) }
}

export function update(patch: Partial<AskAiStorage>) {
	storage?.set(patch)
}

export function setAi(handle: AiHandle | undefined) {
	ai = handle
}

export function getAi(): AiHandle | undefined {
	return ai
}

export function toast(content: string) {
	try {
		showToast(content, 'AskAiToast')
	} catch {
		/* a missing toast must never break an answer */
	}
}
