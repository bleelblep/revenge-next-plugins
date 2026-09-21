/**
 * Four translation services, one interface, and a chain that routes around whichever is having
 * a bad day.
 *
 * ## Why not an LLM
 *
 * Translation is a solved problem with dedicated, free, fast services behind it. Putting a
 * language model in this path would be slower, cost money per message, and give worse results.
 * So this plugin does not depend on AI Core at all — the same reasoning that took the AI back
 * out of Screenshot Redactor.
 *
 * ## What each of these actually is
 *
 * Only MyMemory is a documented public API. The other three are the endpoints the web
 * translators call, used the way a browser would use them — which is how every translate plugin
 * for this ecosystem has ever worked, and is squarely outside those services' terms. They are
 * free, keyless and good, and they can change or start refusing requests without notice. That is
 * the whole reason this file is a chain rather than a single provider: the plugin is built on the
 * assumption that any given one of them will break.
 *
 * All four were verified working before this was written.
 *
 * ## The chain
 *
 * In automatic mode the providers are tried in order until one answers. A provider that fails is
 * put in a short cooldown and skipped, so one dead service costs one request rather than one per
 * translation. Cooldowns expire on their own, so the chain heals without anyone restarting
 * anything.
 */

export interface TranslationResult {
	text: string
	/** The source language the service detected, when it reports one. */
	detected?: string
	/** Which provider answered. */
	provider: ProviderId
}

export type ProviderId = 'google' | 'bing' | 'yandex' | 'mymemory'

export interface Provider {
	id: ProviderId
	name: string
	/** One line for the settings page: what it is and what it costs. */
	note: string
	translate(
		text: string,
		to: string,
		from: string,
	): Promise<TranslationResult | undefined>
}

/**
 * The same language, spelled the way each service wants it.
 *
 * They do not agree. Bing wants `zh-Hans` where Google takes `zh-CN`, `nb` for Norwegian, `fil`
 * for Filipino; Yandex only knows one Chinese. Until the language picker existed, `zh` was sent to
 * all four unchanged and the ones that did not understand it failed into the next.
 *
 * Only the divergences are listed. Anything else is passed through as stored.
 */
const CODE_MAP: Partial<Record<ProviderId, Record<string, string>>> = {
	google: { zh: 'zh-CN' },
	bing: {
		zh: 'zh-Hans',
		'zh-cn': 'zh-Hans',
		'zh-tw': 'zh-Hant',
		no: 'nb',
		tl: 'fil',
		sr: 'sr-Cyrl',
	},
	yandex: { 'zh-cn': 'zh', 'zh-tw': 'zh' },
}

export function codeFor(provider: ProviderId, code: string): string {
	if (code === 'auto') return code
	return CODE_MAP[provider]?.[code.toLowerCase()] ?? code
}

const TIMEOUT_MS = 8000

async function request(
	url: string,
	init?: RequestInit,
): Promise<Response | undefined> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
	try {
		const response = await fetch(url, {
			...init,
			signal: controller.signal,
			headers: {
				// Several of these refuse a request that does not look like a browser.
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
				...(init?.headers ?? {}),
			},
		})
		return response.ok ? response : undefined
	} catch {
		return undefined
	} finally {
		clearTimeout(timer)
	}
}

/** `URLSearchParams` is not reliably present on Hermes, so form bodies are built by hand. */
function form(fields: Record<string, string>): string {
	return Object.entries(fields)
		.map(
			([key, value]) =>
				`${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
		)
		.join('&')
}

// --- Google -----------------------------------------------------------------

/**
 * The endpoint the web widget uses. Returns a deeply nested array rather than an object:
 * `[[["translated","original",…], …], null, "detected-lang", …]`, with long text split across
 * several entries that have to be joined back together.
 */
const google: Provider = {
	id: 'google',
	name: 'Google',
	note: 'Unofficial web endpoint. Best quality of the four, no key.',
	async translate(text, to, from) {
		to = codeFor('google', to)
		from = codeFor('google', from)
		const url =
			'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
			`&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`

		const response = await request(url)
		if (!response) return undefined

		const body: any = await response.json().catch(() => undefined)
		const chunks = body?.[0]
		if (!Array.isArray(chunks)) return undefined

		const translated = chunks
			.map((chunk: any) => (typeof chunk?.[0] === 'string' ? chunk[0] : ''))
			.join('')
		if (!translated) return undefined

		return {
			text: translated,
			detected: typeof body[2] === 'string' ? body[2] : undefined,
			provider: 'google',
		}
	},
}

// --- Bing -------------------------------------------------------------------

/**
 * Bing needs four values scraped from its own translator page — a key, a token, and the `IG` and
 * `IID` request ids. The page states the token's lifetime itself (the third element of
 * `params_AbusePreventionHelper`), so that is used rather than a guess, minus a minute of slack.
 */
interface BingTokens {
	key: string
	token: string
	ig: string
	iid: string
	expiresAt: number
}

let bingTokens: BingTokens | undefined

async function getBingTokens(): Promise<BingTokens | undefined> {
	if (bingTokens && Date.now() < bingTokens.expiresAt) return bingTokens

	const response = await request('https://www.bing.com/translator')
	if (!response) return undefined

	const html = await response.text().catch(() => '')
	const abuse =
		/params_AbusePreventionHelper\s*=\s*\[(\d+),"([^"]+)",(\d+)\]/.exec(html)
	const ig = /IG:"([A-F0-9]+)"/.exec(html)
	const iid = /data-iid="([^"]+)"/.exec(html)
	if (!abuse || !ig || !iid) return undefined

	bingTokens = {
		key: abuse[1],
		token: abuse[2],
		ig: ig[1],
		iid: iid[1],
		expiresAt: Date.now() + Math.max(60_000, Number(abuse[3]) - 60_000),
	}
	return bingTokens
}

const bing: Provider = {
	id: 'bing',
	name: 'Bing',
	note: 'Unofficial web endpoint. Reports the detected language. No key.',
	async translate(text, to, from) {
		to = codeFor('bing', to)
		from = codeFor('bing', from)
		const tokens = await getBingTokens()
		if (!tokens) return undefined

		const response = await request(
			`https://www.bing.com/ttranslatev3?isVertical=1&IG=${tokens.ig}&IID=${tokens.iid}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: form({
					fromLang: from === 'auto' ? 'auto-detect' : from,
					to,
					text,
					token: tokens.token,
					key: tokens.key,
				}),
			},
		)
		if (!response) {
			// A rejected call usually means the token aged out early; drop it so the next attempt
			// fetches a fresh one rather than failing the same way for an hour.
			bingTokens = undefined
			return undefined
		}

		const body: any = await response.json().catch(() => undefined)
		const entry = Array.isArray(body) ? body[0] : undefined
		const translated = entry?.translations?.[0]?.text
		if (typeof translated !== 'string' || !translated) return undefined

		return {
			text: translated,
			detected: entry?.detectedLanguage?.language,
			provider: 'bing',
		}
	},
}

// --- Yandex -----------------------------------------------------------------

/**
 * Yandex's mobile endpoint. The `id` is a client-generated session identifier and is not checked
 * against anything, so a random one per request is fine. The documented v1.5 API and the Cloud
 * API both require keys; this one does not.
 */
const yandex: Provider = {
	id: 'yandex',
	name: 'Yandex',
	note: 'Unofficial mobile endpoint. Strong on Slavic languages. No key.',
	async translate(text, to, from) {
		to = codeFor('yandex', to)
		from = codeFor('yandex', from)
		const id = `${Math.random().toString(16).slice(2)}${Math.random().toString(16).slice(2)}-0-0`
		const lang = from === 'auto' ? to : `${from}-${to}`

		const response = await request(
			`https://translate.yandex.net/api/v1/tr.json/translate?id=${id}&srv=android`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: form({ lang, text }),
			},
		)
		if (!response) return undefined

		const body: any = await response.json().catch(() => undefined)
		const translated = Array.isArray(body?.text)
			? body.text.join(' ')
			: undefined
		if (typeof translated !== 'string' || !translated) return undefined

		return {
			text: translated,
			// Comes back as "en-fr"; only the source half is news.
			detected:
				typeof body.lang === 'string' ? body.lang.split('-')[0] : undefined,
			provider: 'yandex',
		}
	},
}

// --- MyMemory ---------------------------------------------------------------

/**
 * The only documented, sanctioned API of the four, and the only one with a stated quota: roughly
 * 5,000 characters a day anonymously. It has no auto-detect, so it is last in the chain and is
 * skipped entirely when the source language is unknown.
 */
const mymemory: Provider = {
	id: 'mymemory',
	name: 'MyMemory',
	note: 'Official free API, ~5,000 characters a day. Cannot auto-detect the source language.',
	async translate(text, to, from) {
		to = codeFor('mymemory', to)
		from = codeFor('mymemory', from)
		if (from === 'auto') return undefined

		const url =
			'https://api.mymemory.translated.net/get' +
			`?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(`${from}|${to}`)}`

		const response = await request(url)
		if (!response) return undefined

		const body: any = await response.json().catch(() => undefined)
		if (body?.responseStatus !== 200) return undefined

		const translated = body?.responseData?.translatedText
		if (typeof translated !== 'string' || !translated) return undefined
		// The service answers 200 with the quota message in the text field.
		if (/MYMEMORY WARNING/i.test(translated)) return undefined

		return { text: translated, detected: from, provider: 'mymemory' }
	},
}

/** Default order: best quality first, the one with a hard quota last. */
export const PROVIDERS: Provider[] = [google, bing, yandex, mymemory]

export function providerById(id: string): Provider | undefined {
	return PROVIDERS.find(provider => provider.id === id)
}

// --- the chain --------------------------------------------------------------

/** How long a failed provider is skipped for. Long enough to matter, short enough to heal. */
const COOLDOWN_MS = 5 * 60 * 1000

const cooldowns = new Map<ProviderId, number>()

export function cooledDown(id: ProviderId): boolean {
	const until = cooldowns.get(id)
	return until !== undefined && Date.now() < until
}

export function resetCooldowns() {
	cooldowns.clear()
}

/** For the Debug page: which providers are currently being skipped, and for how long. */
export function cooldownStatus(): Array<{
	id: ProviderId
	secondsLeft: number
}> {
	const now = Date.now()
	return [...cooldowns.entries()]
		.filter(([, until]) => until > now)
		.map(([id, until]) => ({
			id,
			secondsLeft: Math.ceil((until - now) / 1000),
		}))
}

export interface ChainOutcome {
	result?: TranslationResult
	/** Every provider tried and how it went, for the Debug page. */
	attempts: Array<{ id: ProviderId; outcome: 'ok' | 'failed' | 'skipped' }>
}

/**
 * Tries providers in order until one answers.
 *
 * A provider that throws or returns nothing is cooled down and the chain moves on. Only if every
 * one of them fails does this return without a result — at which point the caller should say so
 * plainly rather than silently doing nothing.
 */
export async function translateWithChain(
	text: string,
	to: string,
	from: string,
	order: Provider[],
): Promise<ChainOutcome> {
	const attempts: ChainOutcome['attempts'] = []

	for (const provider of order) {
		if (cooledDown(provider.id)) {
			attempts.push({ id: provider.id, outcome: 'skipped' })
			continue
		}

		try {
			const result = await provider.translate(text, to, from)
			if (result) {
				attempts.push({ id: provider.id, outcome: 'ok' })
				// A success clears any earlier grudge against it.
				cooldowns.delete(provider.id)
				return { result, attempts }
			}
		} catch (error) {
			console.error(`[Translate] ${provider.id} threw:`, error)
		}

		attempts.push({ id: provider.id, outcome: 'failed' })
		cooldowns.set(provider.id, Date.now() + COOLDOWN_MS)
	}

	return { attempts }
}
