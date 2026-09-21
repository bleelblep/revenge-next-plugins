/**
 * The one place in this repository that talks to a model.
 *
 * It speaks the OpenAI chat-completions shape, which DeepSeek, OpenRouter, Groq and a local
 * llama.cpp all accept — hence `baseUrl` being a setting rather than a constant.
 *
 * ## It fails open, always
 *
 * Every error path returns `undefined`, and no path throws. A missing key, a timeout, a rate
 * limit, malformed JSON, the provider being down — a dependent plugin must be able to treat all
 * of them identically, as "no opinion", and carry on doing whatever it does without a model.
 * Anything else would make installing this plugin a way to break the plugins that use it.
 *
 * ## The queue
 *
 * Requests are not fired the moment they arrive. Several dependents on one device will otherwise
 * collide — a two-hundred-message summary and a send-guard check hitting the same endpoint in the
 * same second — and the provider answers that with a rate limit rather than two answers.
 */

import { capFor, debug, recordCall, remainingFor, settings, TAG } from './state'
import type { AiRequest } from '../types'

// --- a queue with a concurrency limit ---------------------------------------

type Job = () => Promise<void>

const pending: Job[] = []
let running = 0
/** Aborts everything in flight when the plugin stops. */
let controllers = new Set<AbortController>()

function pump() {
	const limit = Math.max(1, settings().concurrency)
	while (running < limit && pending.length) {
		const job = pending.shift()
		if (!job) break
		running++
		job().finally(() => {
			running--
			pump()
		})
	}
}

function enqueue<T>(work: () => Promise<T>): Promise<T> {
	return new Promise<T>(resolve => {
		pending.push(async () => {
			resolve(await work())
		})
		pump()
	})
}

/**
 * Teardown gets five seconds before Revenge flags the plugin, so this cannot wait on the network.
 * In-flight requests are aborted and the backlog is dropped, both synchronously.
 */
export function abortAll() {
	pending.length = 0
	for (const controller of controllers) {
		try {
			controller.abort()
		} catch {
			/* an already-settled request is nothing to report */
		}
	}
	controllers = new Set()
	running = 0
}

// --- the call ----------------------------------------------------------------

export interface RawResult {
	content: string
	promptTokens: number
	completionTokens: number
}

async function callOnce(
	pluginId: string,
	request: AiRequest,
	json: boolean,
): Promise<RawResult | undefined> {
	const s = settings()
	if (!s.apiKey) {
		debug(`${pluginId}: no API key set`)
		return undefined
	}
	if (remainingFor(pluginId) <= 0) {
		// Say which limit stopped it. "Out of budget" with two possible budgets is not a
		// diagnosis the user can act on.
		const own = capFor(pluginId)
		debug(
			own >= 0
				? `${pluginId}: its own cap of ${own} is spent, or the shared cap of ${s.dailyCallCap} is`
				: `${pluginId}: the shared daily cap of ${s.dailyCallCap} is spent`,
		)
		return undefined
	}

	const controller = new AbortController()
	controllers.add(controller)
	const timer = setTimeout(
		() => controller.abort(),
		request.timeoutMs ?? s.timeoutMs,
	)

	try {
		const response = await fetch(
			`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`,
			{
				method: 'POST',
				signal: controller.signal,
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${s.apiKey}`,
				},
				body: JSON.stringify({
					model: s.model,
					temperature: request.temperature ?? 0,
					max_tokens: request.maxTokens ?? 256,
					...(json ? { response_format: { type: 'json_object' } } : {}),
					messages: request.messages,
				}),
			},
		)

		if (!response.ok) {
			// 401 and 402 are the two the user can actually fix, so they are never swallowed.
			console.error(
				`${TAG} ${pluginId}: provider returned HTTP ${response.status}`,
			)
			return undefined
		}

		const body: any = await response.json()
		const usage = body?.usage
		const promptTokens = usage?.prompt_tokens ?? 0
		const completionTokens = usage?.completion_tokens ?? 0
		recordCall(pluginId, promptTokens, completionTokens)

		const content = body?.choices?.[0]?.message?.content
		if (typeof content !== 'string') return undefined

		debug(`${pluginId}: ${promptTokens} in, ${completionTokens} out`)
		return { content, promptTokens, completionTokens }
	} catch (error) {
		// An abort lands here too, which is exactly the fail-open path we want.
		debug(`${pluginId}: call failed:`, error)
		return undefined
	} finally {
		clearTimeout(timer)
		controllers.delete(controller)
	}
}

export function requestText(
	pluginId: string,
	request: AiRequest,
): Promise<string | undefined> {
	return enqueue(
		async () => (await callOnce(pluginId, request, false))?.content,
	)
}

export async function requestJson<T>(
	pluginId: string,
	request: AiRequest,
): Promise<T | undefined> {
	const result = await enqueue(() => callOnce(pluginId, request, true))
	if (!result) return undefined
	return parseObject<T>(result.content)
}

/**
 * `response_format: json_object` makes a bare object overwhelmingly likely, but a model that
 * wraps it in a fence or adds a sentence must not take the caller down with it.
 */
function parseObject<T>(content: string): T | undefined {
	const start = content.indexOf('{')
	const end = content.lastIndexOf('}')
	if (start === -1 || end <= start) return undefined
	try {
		return JSON.parse(content.slice(start, end + 1)) as T
	} catch {
		return undefined
	}
}
