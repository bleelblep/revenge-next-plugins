/**
 * The providers offered in the picker. Picking one fills in its base URL and a starting model; both
 * stay editable. Which one is selected is worked out from the base URL, so there is nothing new to
 * store and a hand-typed URL for one of these still shows as that provider.
 *
 * Anthropic and OpenAI get their own request handling natively (AiCore.kt): Anthropic's Messages
 * API, and OpenAI's reasoning-model parameters. The rest speak the plain OpenAI chat shape.
 */
export interface Provider {
	id: string
	label: string
	baseUrl: string
	model: string
	/** Where the user gets a key, for the row's subtitle. */
	keysAt: string
}

export const PROVIDERS: Provider[] = [
	{
		id: 'anthropic',
		label: 'Anthropic',
		baseUrl: 'https://api.anthropic.com',
		model: 'claude-opus-5',
		keysAt: 'console.anthropic.com',
	},
	{
		id: 'openai',
		label: 'OpenAI',
		baseUrl: 'https://api.openai.com/v1',
		model: 'gpt-5-mini',
		keysAt: 'platform.openai.com',
	},
	{
		id: 'deepseek',
		label: 'DeepSeek',
		baseUrl: 'https://api.deepseek.com',
		model: 'deepseek-chat',
		keysAt: 'platform.deepseek.com',
	},
	{
		id: 'openrouter',
		label: 'OpenRouter',
		baseUrl: 'https://openrouter.ai/api/v1',
		model: 'openrouter/auto',
		keysAt: 'openrouter.ai',
	},
]

export const CUSTOM = 'custom'

const hostOf = (url: string) => url.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').toLowerCase()

/** The provider a base URL belongs to, or `custom`. */
export function providerFor(baseUrl: string): string {
	const host = hostOf(baseUrl || '')
	return PROVIDERS.find(p => hostOf(p.baseUrl) === host)?.id ?? CUSTOM
}
