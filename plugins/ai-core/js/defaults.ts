import type { AiCoreStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start (porting rule 7).
 */
export const DEFAULTS: AiCoreStorage = {
	apiKey: '',
	baseUrl: 'https://api.deepseek.com',
	model: 'deepseek-chat',
	timeoutMs: 4000,
	dailyCallCap: 40,
	concurrency: 2,

	enforcePerPluginCaps: false,
	perPluginCaps: {},

	usageDay: '',
	usageCalls: 0,
	usagePromptTokens: 0,
	usageCompletionTokens: 0,
	usageByPlugin: {},

	debugLogging: false,
}
