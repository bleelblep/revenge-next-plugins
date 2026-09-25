/**
 * Plugin Doctor: is every installed plugin loaded, is any of them out of date, and everything else
 * Revenge will say about each one.
 *
 * ## Where the answers come from
 *
 * **Always:** `revenge.plugins.list`, a native method reached through the public `callNativeMethod`
 * -- the same route AI Core uses for its vault. Unlike the `pList` registry in `lib/installed.ts` it
 * is not on the hidden API. It returns every installed plugin, core ones included (confirmed live on
 * 348.2, RevengeXposed 1.6.3):
 *
 * - `manifest`, whose `version` arrives parsed as `{ label, nums }`
 * - `failed`: did not load this session, and why is in `errors`
 * - `errors[]`: `{ code, message, stack? }`, codes such as `DEPENDENCY_MISSING` or `LOAD_FAILED`
 * - `unsatisfiedOptionalDependencies`: ids it would use if they were installed
 * - `source`: `{ repo, channel }`, where `repo` is the repository's base URL; null for core
 *   plugins and side-loads
 * - `internal` / `essential` (Revenge's own plugins), `api` (decorates other plugins)
 * - `script`: the plugin's whole source. Only its length is kept.
 *
 * **Also, while Developer Mode is on:** the live registry on the hidden API (`internals()` in
 * `lib/installed.ts`) adds enabled / started-late / waiting-for-restart / pending-update state.
 * Every read of it is guarded; without it those fields are simply absent.
 *
 * **Updates:** each distinct repository's `index.json` is fetched once per checkup, and the
 * installed version is compared with the version the plugin's channel points at.
 *
 * Nothing here writes anything, or talks to anything but the repositories the plugins came from.
 *
 * ## What is not here, and why
 *
 * Per-plugin start-up time (Revenge does not record it), storage use (the fs API cannot list a
 * folder or size a file) and which plugin patched what (the patcher keeps no owner).
 */

import { internals, MY_PREFIX } from './installed'

export type Health = 'error' | 'warning' | 'ok'

export interface Version {
	nums: number[]
	label: string | null
}

export interface PluginError {
	code: string
	message: string
	stack: string | null
}

export interface Dependency {
	id: string
	range: string
	optional: boolean
	/** Version of the dependency that is installed, or null when it is not. */
	installed: Version | null
	/** Whether `installed` falls within `range`; null when the range could not be read. */
	satisfied: boolean | null
}

export interface Published {
	version: string
	size: number | null
}

/** Only while Developer Mode is on. */
export interface LiveState {
	enabled: boolean | null
	status: string | null
	startedLate: boolean
	pendingReload: boolean
	pendingUpdate: boolean
	errored: boolean
}

export type Origin = 'core' | 'mine' | 'third-party' | 'side-loaded'

export interface Diagnosis {
	id: string
	name: string
	author: string | null
	description: string | null
	icon: string | null
	version: Version | null
	origin: Origin
	/** Revenge's own plugins (the API, Discord itself, recovery...). Listed apart, never flagged. */
	core: boolean
	failed: boolean
	errors: PluginError[]
	missingOptional: string[]
	dependencies: Dependency[]
	/** Ids of the installed plugins that depend on this one. */
	dependents: string[]
	hasNative: boolean
	/** Decorates every other plugin (an API plugin). */
	isApi: boolean
	enabledByDefault: boolean | null
	scriptBytes: number | null
	repo: string | null
	channel: string | null
	/** What the repository's channel points at, when the index could be read. */
	latest: Version | null
	latestSize: number | null
	/** Every version the repository lists, newest first. */
	published: Published[]
	/** Why `latest` is missing, when it is. */
	indexProblem?: string
	live: LiveState | null
	health: Health
	/** One line per finding, most serious first. Empty when there is nothing to say. */
	notes: string[]
}

export interface Checkup {
	at: number
	discord: Version | null
	revengeApi: Version | null
	/** Whether Developer Mode's live registry could be read for this checkup. */
	liveState: boolean
	plugins: Diagnosis[]
	/** Set when the plugin list itself could not be read. */
	problem?: string
}

// --- versions ------------------------------------------------------------------

export function formatVersion(version: Version | null | undefined): string {
	if (!version?.nums?.length) return 'unknown'
	return version.label ? `${version.nums.join('.')}-${version.label}` : version.nums.join('.')
}

/** `2.1.0`, `0.5.0-beta9` -> nums and label. The same split Revenge's parser makes. */
export function parseVersion(raw: unknown): Version | null {
	if (typeof raw !== 'string' || !raw.trim()) return null
	const [main, ...rest] = raw.trim().replace(/^v/, '').split('-')
	const nums = main.split('.').map(part => Number.parseInt(part, 10))
	if (nums.some(n => !Number.isFinite(n))) return null
	return { nums, label: rest.length ? rest.join('-') : null }
}

/** A version as Revenge hands it over (`{ label, nums }`) or as a string. */
export function asVersion(value: any): Version | null {
	if (value && Array.isArray(value.nums)) {
		return { nums: value.nums.map(Number), label: value.label ?? null }
	}
	return parseVersion(value)
}

/** Negative when `a` is older. A pre-release (`-beta2`) is older than the same release without one. */
export function compareVersions(a: Version, b: Version): number {
	const length = Math.max(a.nums.length, b.nums.length)
	for (let i = 0; i < length; i++) {
		const diff = (a.nums[i] ?? 0) - (b.nums[i] ?? 0)
		if (diff) return diff
	}
	if (a.label === b.label) return 0
	if (!a.label) return 1
	if (!b.label) return -1
	return a.label.localeCompare(b.label, undefined, { numeric: true })
}

/**
 * Whether `version` satisfies a manifest range: `*`, `>=1 <2`, `^1.2`, `~1.2.3`, `1.x`, `a || b`.
 * Null for anything it cannot read, so an unusual range is shown as unknown rather than as broken.
 */
export function satisfies(version: Version, range: string): boolean | null {
	const trimmed = range.trim()
	if (!trimmed || trimmed === '*' || trimmed === 'x') return true
	let unreadable = false
	const test = (comparator: string): boolean => {
		const match = /^(>=|<=|>|<|=|\^|~)?\s*v?([\dx*.]+(?:-[\w.]+)?)$/.exec(comparator)
		if (!match) {
			unreadable = true
			return false
		}
		const [, op = '=', raw] = match
		if (/[x*]/.test(raw)) {
			const fixed = raw.split('.').filter(part => !/[x*]/.test(part)).map(Number)
			return fixed.every((n, i) => version.nums[i] === n)
		}
		const target = parseVersion(raw)
		if (!target) {
			unreadable = true
			return false
		}
		const order = compareVersions(version, target)
		switch (op) {
			case '>=':
				return order >= 0
			case '<=':
				return order <= 0
			case '>':
				return order > 0
			case '<':
				return order < 0
			case '^':
			case '~': {
				if (order < 0) return false
				// ^ holds the first non-zero part, ~ holds major.minor (or major alone).
				const held =
					op === '^'
						? Math.max(1, target.nums.findIndex(n => n !== 0) + 1)
						: Math.min(2, Math.max(1, target.nums.length - 1))
				return target.nums.slice(0, held).every((n, i) => version.nums[i] === n)
			}
			default:
				return order === 0
		}
	}
	const result = trimmed
		.split('||')
		.some(part => part.trim().split(/\s+/).filter(Boolean).every(test))
	return unreadable && !result ? null : result
}

export function formatBytes(bytes: number | null | undefined): string {
	if (typeof bytes !== 'number' || !Number.isFinite(bytes)) return 'unknown'
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

// --- reading -------------------------------------------------------------------

const ERROR_TEXT: Record<string, string> = {
	DEPENDENCY_MISSING: 'needs a plugin that is not installed',
	DEPENDENCY_UNSATISFIED: 'needs a different version of a plugin it depends on',
	DEPENDENCY_FAILED: 'a plugin it depends on failed to load',
	DEPENDENCY_CYCLE: 'its dependencies depend on each other in a loop',
	LOAD_FAILED: 'its code failed to load',
	PLUGIN_ERROR: 'threw an error while running',
	MANIFEST_INVALID: 'its manifest is invalid',
}

export function describeError(error: PluginError): string {
	return ERROR_TEXT[error.code] ?? error.code.toLowerCase().replace(/_/g, ' ')
}

const capitalise = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)

async function readList(): Promise<any[]> {
	const native = (revenge.modules.native as any).callNativeMethod
	const list = await native('revenge.plugins.list', [])
	if (!Array.isArray(list)) throw new Error('Revenge returned no plugin list')
	return list
}

const INDEX_TIMEOUT_MS = 8000

async function readIndex(repo: string): Promise<any> {
	const controller = typeof AbortController === 'function' ? new AbortController() : undefined
	const timer = setTimeout(() => controller?.abort(), INDEX_TIMEOUT_MS)
	try {
		const response = await fetch(`${repo.replace(/\/+$/, '')}/index.json`, {
			signal: controller?.signal,
			headers: { 'Cache-Control': 'no-cache' },
		})
		if (!response.ok) throw new Error(`HTTP ${response.status}`)
		return await response.json()
	} finally {
		clearTimeout(timer)
	}
}

export function hostOf(repo: string): string {
	return repo.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
}

/** Developer Mode's live state for every plugin, by id; undefined when it is not available. */
function readLiveStates(): Map<string, LiveState> | undefined {
	const internal = internals()
	const list = internal?.pList
	if (!(list instanceof Map)) return undefined

	let statusNames: Record<number, string> = {}
	try {
		const PluginStatus = (revenge as any).plugins?.constants?.PluginStatus
		if (PluginStatus && typeof PluginStatus === 'object') {
			statusNames = Object.fromEntries(
				Object.entries(PluginStatus).map(([name, value]) => [value as number, name]),
			)
		}
	} catch {
		/* statuses stay numeric */
	}

	const ask = (name: string, plugin: any): boolean => {
		try {
			return typeof internal[name] === 'function' ? !!internal[name](plugin) : false
		} catch {
			return false
		}
	}

	const out = new Map<string, LiveState>()
	for (const plugin of list.values()) {
		const id = plugin?.manifest?.id
		if (typeof id !== 'string') continue
		let status: string | null = null
		try {
			const raw = plugin.status
			if (typeof raw === 'number') status = statusNames[raw] ?? `status ${raw}`
		} catch {
			/* no status */
		}
		out.set(id, {
			enabled: typeof internal.isPluginEnabled === 'function' ? ask('isPluginEnabled', plugin) : null,
			status,
			startedLate: ask('isPluginStartedLate', plugin),
			pendingReload: ask('isPluginPendingReload', plugin),
			pendingUpdate: ask('isPluginPendingUpdate', plugin),
			errored: ask('isPluginErrored', plugin),
		})
	}
	return out
}

// --- the checkup ---------------------------------------------------------------

let last: Checkup | undefined
const listeners = new Set<() => void>()

/** The most recent checkup this session, if one has run. */
export function lastCheckup(): Checkup | undefined {
	return last
}

export function findPlugin(id: string): Diagnosis | undefined {
	return last?.plugins.find(plugin => plugin.id === id)
}

export function onCheckup(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

/** Problems worth a number on the settings row: failures and missing requirements, not updates. */
export function problemCount(checkup: Checkup | undefined = last): number {
	return checkup?.plugins.filter(plugin => plugin.health === 'error').length ?? 0
}

function publish(checkup: Checkup): Checkup {
	last = checkup
	for (const listener of listeners) listener()
	return checkup
}

export async function runCheckup(): Promise<Checkup> {
	let raw: any[]
	try {
		raw = await readList()
	} catch (error) {
		return publish({
			at: Date.now(),
			discord: null,
			revengeApi: null,
			liveState: false,
			plugins: [],
			problem: `Revenge would not share its plugin list (${String(error)}). If Developer Mode is off, try turning it on under Revenge's settings.`,
		})
	}

	const entries = raw.filter(plugin => typeof plugin?.manifest?.id === 'string')
	const versions = new Map<string, Version | null>(
		entries.map(plugin => [plugin.manifest.id, asVersion(plugin.manifest.version)]),
	)
	const live = readLiveStates()

	const plugins: Diagnosis[] = entries.map(plugin => {
		const manifest = plugin.manifest
		const id: string = manifest.id
		const core = !!(plugin.internal || plugin.essential)
		const repo = typeof plugin.source?.repo === 'string' ? plugin.source.repo : null
		const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value : null)

		const dependencies: Dependency[] = Object.entries(manifest.dependencies ?? {}).map(
			([depId, spec]: [string, any]) => {
				const range = typeof spec === 'string' ? spec : String(spec?.version ?? '*')
				const installed = versions.get(depId) ?? null
				return {
					id: depId,
					range,
					optional: !!spec?.optional,
					installed,
					satisfied: installed ? satisfies(installed, range) : false,
				}
			},
		)

		return {
			id,
			name: text(manifest.name) ?? id,
			author: text(manifest.author),
			description: text(manifest.description),
			icon: text(manifest.icon),
			version: versions.get(id) ?? null,
			origin: core ? 'core' : !repo ? 'side-loaded' : id.startsWith(MY_PREFIX) ? 'mine' : 'third-party',
			core,
			failed: !!plugin.failed,
			errors: Array.isArray(plugin.errors)
				? plugin.errors.map((e: any) => ({
						code: String(e?.code ?? 'UNKNOWN'),
						message: String(e?.message ?? ''),
						stack: typeof e?.stack === 'string' && e.stack ? e.stack : null,
					}))
				: [],
			missingOptional: Array.isArray(plugin.unsatisfiedOptionalDependencies)
				? plugin.unsatisfiedOptionalDependencies.map(String)
				: [],
			dependencies,
			dependents: [],
			hasNative: !!manifest.dist?.android,
			isApi: !!plugin.api,
			enabledByDefault: typeof plugin.enabledByDefault === 'boolean' ? plugin.enabledByDefault : null,
			scriptBytes: typeof plugin.script === 'string' ? plugin.script.length : null,
			repo,
			channel: typeof plugin.source?.channel === 'string' ? plugin.source.channel : null,
			latest: null,
			latestSize: null,
			published: [],
			live: live?.get(id) ?? null,
			health: 'ok' as Health,
			notes: [],
		}
	})

	const byId = new Map(plugins.map(plugin => [plugin.id, plugin]))
	for (const plugin of plugins) {
		for (const dependency of plugin.dependencies) byId.get(dependency.id)?.dependents.push(plugin.id)
	}

	// One fetch per repository, all at once. A repository that cannot be reached costs only the
	// update check for its own plugins.
	const repos = [...new Set(plugins.map(plugin => plugin.repo).filter((r): r is string => !!r))]
	const indexes = new Map<string, { index?: any; problem?: string }>()
	await Promise.all(
		repos.map(async repo => {
			try {
				indexes.set(repo, { index: await readIndex(repo) })
			} catch (error) {
				const aborted = (error as any)?.name === 'AbortError'
				indexes.set(repo, {
					problem: aborted ? `${hostOf(repo)} did not answer` : `${hostOf(repo)}: ${String(error)}`,
				})
			}
		}),
	)

	for (const plugin of plugins) {
		if (plugin.repo) {
			const { index, problem } = indexes.get(plugin.repo) ?? {}
			const entry = index?.plugins?.[plugin.id]
			if (problem) plugin.indexProblem = problem
			else if (!entry) plugin.indexProblem = `no longer listed by ${hostOf(plugin.repo)}`
			else {
				const latestRaw = entry.channels?.[plugin.channel ?? 'latest']
				plugin.latest = parseVersion(latestRaw)
				plugin.published = Object.entries(entry.versions ?? {})
					.map(([version, info]: [string, any]) => ({
						version,
						size: typeof info?.size === 'number' ? info.size : null,
					}))
					.sort((a, b) => {
						const va = parseVersion(a.version)
						const vb = parseVersion(b.version)
						return va && vb ? compareVersions(vb, va) : b.version.localeCompare(a.version)
					})
				plugin.latestSize =
					plugin.published.find(published => published.version === latestRaw)?.size ?? null
			}
		}
		diagnose(plugin)
	}

	plugins.sort((a, b) => a.name.localeCompare(b.name))
	return publish({
		at: Date.now(),
		discord: versions.get('discord') ?? null,
		revengeApi: versions.get('revenge.api') ?? null,
		liveState: !!live,
		plugins,
	})
}

function diagnose(plugin: Diagnosis) {
	const notes: string[] = []
	// Widened on purpose: `raise` changes it from a closure, which narrowing cannot see.
	let health = 'ok' as Health
	const raise = (to: Health) => {
		if (to === 'error' || (to === 'warning' && health === 'ok')) health = to
	}

	if (plugin.failed) {
		raise('error')
		notes.push(
			plugin.errors.length
				? `Did not load: ${describeError(plugin.errors[0])}`
				: 'Did not load this session',
		)
	}
	for (const error of plugin.failed ? plugin.errors.slice(1) : plugin.errors) {
		raise('error')
		notes.push(capitalise(describeError(error)))
	}
	for (const dependency of plugin.dependencies) {
		if (dependency.optional || dependency.satisfied !== false || plugin.failed) continue
		raise('error')
		notes.push(
			dependency.installed
				? `Needs ${dependency.id} ${dependency.range}, has ${formatVersion(dependency.installed)}`
				: `Needs ${dependency.id}, which is not installed`,
		)
	}
	if (plugin.missingOptional.length) {
		raise('warning')
		notes.push(`Running without ${plugin.missingOptional.join(', ')} (optional)`)
	}

	if (plugin.live) {
		if (plugin.live.errored && !plugin.errors.length) {
			raise('error')
			notes.push('Hit an error while running this session')
		}
		if (plugin.live.pendingUpdate) notes.push('Update installed; it applies after a restart')
		else if (plugin.live.pendingReload) {
			raise('warning')
			notes.push('Waiting for Discord to restart')
		}
		if (plugin.live.startedLate) notes.push('Turned on mid-session; some parts need a restart')
		if (plugin.live.enabled === false) notes.push('Turned off')
	}

	if (plugin.latest && plugin.version) {
		const order = compareVersions(plugin.version, plugin.latest)
		if (order < 0) {
			raise('warning')
			notes.push(`Update available: ${formatVersion(plugin.latest)}`)
		} else if (order > 0) {
			notes.push(`Newer than published (${formatVersion(plugin.latest)}): a test or local build`)
		}
	} else if (plugin.indexProblem) {
		notes.push(`Could not check for updates: ${plugin.indexProblem}`)
	} else if (plugin.origin === 'side-loaded') {
		notes.push('Side-loaded, so there is nothing to check updates against')
	}

	plugin.health = plugin.core && health === 'warning' ? 'ok' : health
	plugin.notes = notes
}

// --- the report ----------------------------------------------------------------

const STACK_LINES = 6

function describePlugin(plugin: Diagnosis, lines: string[], checkup: Checkup) {
	const where = plugin.repo ? `${hostOf(plugin.repo)}, ${plugin.channel ?? 'latest'}` : plugin.origin
	lines.push(`- ${plugin.id} ${formatVersion(plugin.version)} [${where}]`)
	for (const note of plugin.notes) lines.push(`    ${note}`)
	if (plugin.dependencies.length) {
		const deps = plugin.dependencies.map(dependency => {
			const mark = dependency.satisfied === true ? 'ok' : dependency.satisfied === false ? 'NO' : '?'
			return `${dependency.id} ${dependency.range}${dependency.optional ? ' (optional)' : ''} = ${formatVersion(dependency.installed)} ${mark}`
		})
		lines.push(`    needs: ${deps.join('; ')}`)
	}
	if (plugin.dependents.length) {
		const name = (id: string) => checkup.plugins.find(p => p.id === id)?.name ?? id
		lines.push(`    used by: ${plugin.dependents.map(name).join(', ')}`)
	}
	const facts = [
		plugin.hasNative ? 'native' : null,
		plugin.isApi ? 'API plugin' : null,
		plugin.scriptBytes != null ? `script ${formatBytes(plugin.scriptBytes)}` : null,
		plugin.live?.status ? `status ${plugin.live.status}` : null,
	].filter(Boolean)
	if (facts.length) lines.push(`    ${facts.join(' · ')}`)
	for (const error of plugin.errors) {
		lines.push(`    ${error.code}: ${error.message}`)
		if (error.stack) {
			for (const line of error.stack.split('\n').slice(0, STACK_LINES)) lines.push(`      ${line.trim()}`)
		}
	}
}

/** Header lines shared by the full report and a single plugin's. */
function header(checkup: Checkup): string[] {
	return [
		`Discord ${formatVersion(checkup.discord)} · Revenge API ${formatVersion(checkup.revengeApi)}`,
		`Checked ${new Date(checkup.at).toISOString()}${checkup.liveState ? ' · Developer Mode on' : ''}`,
	]
}

/**
 * A plain-text summary to paste into a bug report: the build, then every plugin with where it
 * came from, what it needs, what uses it, and anything wrong -- errors with the top of their stack.
 */
export function formatReport(checkup: Checkup): string {
	const lines = ['Plugin Doctor report', ...header(checkup)]
	if (checkup.problem) {
		lines.push('', checkup.problem)
		return lines.join('\n')
	}

	const section = (title: string, list: Diagnosis[]) => {
		if (!list.length) return
		lines.push('', `${title} (${list.length})`)
		for (const plugin of list) describePlugin(plugin, lines, checkup)
	}

	const own = checkup.plugins.filter(plugin => !plugin.core)
	section('Problems', own.filter(plugin => plugin.health === 'error'))
	section('Warnings', own.filter(plugin => plugin.health === 'warning'))
	section('Healthy', own.filter(plugin => plugin.health === 'ok'))
	section('Built in', checkup.plugins.filter(plugin => plugin.core))
	return lines.join('\n')
}

export function formatPluginReport(plugin: Diagnosis, checkup: Checkup): string {
	const lines = [`Plugin Doctor: ${plugin.name}`, ...header(checkup), '']
	describePlugin(plugin, lines, checkup)
	return lines.join('\n')
}

/** Clipboard from Revenge's bundled module, falling back to React Native's. False if neither is there. */
export function copyText(text: string): boolean {
	try {
		const bundled = (revenge as any).externals?.ReactNativeClipboard?.Clipboard
		const clipboard = bundled ?? (revenge.react.ReactNative as any)?.Clipboard
		if (typeof clipboard?.setString !== 'function') return false
		clipboard.setString(text)
		return true
	} catch {
		return false
	}
}
