export interface AiCoreStorage {
	/**
	 * Legacy (1.x): the key in plain text. Only read once, to move it into the native vault, and
	 * then blanked. Nothing writes it any more.
	 */
	apiKey: string
	/** Where the *next* key entered will be bound. The key in the vault is bound to its own. */
	baseUrl: string
	model: string
	timeoutMs: number
	/** Legacy (1.x). Imported once as the vault's starting cap; the vault owns the cap now. */
	dailyCallCap: number
	/** How many requests may be in flight at once. */
	concurrency: number

	/**
	 * Whether the per-plugin caps below are enforced at all. Off means only the shared daily cap
	 * applies, which is the simpler mental model and the right default.
	 */
	enforcePerPluginCaps: boolean
	/**
	 * Calls per day allowed to each plugin id, on top of the shared cap.
	 *
	 * `-1` means no limit and is the tombstone for "never set" -- `0` has to stay available as a
	 * real value meaning "this plugin may not call out at all", and a merge cannot delete a key
	 * (porting rule 6), so absence and zero could not otherwise be told apart.
	 */
	perPluginCaps: Record<string, number>

	// Legacy (1.x) accounting, superseded by the vault's own and no longer written.
	usageDay: string
	usageCalls: number
	usagePromptTokens: number
	usageCompletionTokens: number
	/** Calls per dependent plugin id, for the day in `usageDay`. */
	usageByPlugin: Record<string, number>

	debugLogging: boolean
}

// --- the surface handed to dependent plugins --------------------------------

export interface AiMessage {
	role: 'system' | 'user' | 'assistant'
	content: string
}

export interface AiRequest {
	messages: AiMessage[]
	/** Defaults to 0. */
	temperature?: number
	/** Defaults to 256. */
	maxTokens?: number
	/** Overrides the configured timeout for this one call. */
	timeoutMs?: number
}

export interface AiBudget {
	configured: boolean
	used: number
	cap: number
	remaining: number
	promptTokens: number
	completionTokens: number
}

/**
 * What `decorate()` hangs on each dependent's scoped api as `api.ai`.
 *
 * Every method resolves `undefined` rather than rejecting. A dependent should treat an absent
 * answer as "no opinion" and carry on — see the failure note in `lib/client.ts`.
 */
export interface AiApi {
	/** False when no key is set, the cap is spent, or the day's budget is zero. */
	isAvailable(): boolean
	/** Plain text completion. */
	text(request: AiRequest): Promise<string | undefined>
	/** Asks for one JSON object and parses it. Returns undefined if it cannot be parsed. */
	json<T = unknown>(request: AiRequest): Promise<T | undefined>
	budget(): AiBudget
	/**
	 * Volunteer a navigator route so AI Core's settings screen can link back to yours. Optional:
	 * a dependent that never calls this still appears in the list, just without a tap target.
	 */
	setSettingsRoute(route: string): void
}
