export interface CatchUpStorage {
	/** How many messages `/catchup` reads when no count is given. */
	defaultCount: number
	/** Ceiling on the count argument, so one typo cannot send a whole channel. */
	maxCount: number
	/** Skip bot messages. Almost always wanted; off for channels that are mostly webhooks. */
	skipBots: boolean
	/** Show a toast while the call is in flight. */
	announce: boolean
	debugLogging: boolean
}

/**
 * The slice of AI Core's decorated api this plugin uses.
 *
 * Declared locally rather than imported. Unlike Second Thoughts the dependency is required, not
 * optional, but a required dependency still cannot be imported from at build time -- plugins are
 * separate bundles and `api.ai` only exists at runtime.
 */
export interface AiHandle {
	isAvailable(): boolean
	text(request: {
		messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
		temperature?: number
		maxTokens?: number
		timeoutMs?: number
	}): Promise<string | undefined>
	budget(): {
		configured: boolean
		used: number
		cap: number
		remaining: number
	}
	setSettingsRoute?(route: string): void
}
