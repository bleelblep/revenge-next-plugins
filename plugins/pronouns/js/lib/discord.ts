/**
 * Discord's own pronouns, from the profile store.
 *
 * Pronouns are NOT on the UserRecord — they arrive with the profile, into
 * `modules/user_profile/UserProfileStore.tsx`. `getUserProfile(userId)?.pronouns` holds the user's
 * own; `getGuildMemberProfile(userId, guildId)?.pronouns` the guild-specific one, which wins when
 * it is set (the same precedence as DisplayProfile).
 *
 * Missing profiles are fetched with `fetchProfile(userId, { guildId })` from
 * `actions/UserActionCreators.tsx`, the call opening a profile makes. 0.2.0 and earlier used
 * `maybeFetchUserProfile(userId)`, which skips anyone whose user profile is already loaded and
 * never loads the guild member profile, so guild pronouns only appeared after opening the
 * profile (verified on 350.4, 2026-10-11). Fetches go one at a time, paced, and a failed one is
 * retried with backoff instead of being written off for the session.
 */

import { getModuleByPath } from '../../../../shared/modules'
import * as filters from '@revenge-mod/modules/finders/filters'
import { Stores } from '@revenge-mod/discord/flux'
import { reportError } from '../../../../shared/report'

const PROFILE_STORE = 'modules/user_profile/UserProfileStore.tsx'
const ACTIONS = 'actions/UserActionCreators.tsx'
const TAG = '[Pronouns]'

let store: any
/** Tries the store candidates again; set while watching. */
let retryBind: (() => boolean) | undefined
let fetchProfile: ((userId: string, options?: { guildId?: string }) => unknown) | undefined

export function watchDiscord(): () => void {
	const undo: Array<() => void> = []
	let active = true
	let subscribed = false

	// Binds a store candidate (namespace, default, or the store itself) and subscribes to its
	// changes, so rows waiting on a profile redraw when one lands.
	const bind = (candidate: any) => {
		if (store || !candidate || typeof candidate.getUserProfile !== 'function') return false
		store = candidate
		const subscribe =
			typeof store.addChangeListener === 'function'
				? store.addChangeListener.bind(store)
				: typeof store.addListener === 'function'
				  ? store.addListener.bind(store)
				  : typeof store.subscribe === 'function'
				    ? store.subscribe.bind(store)
				    : undefined
		if (typeof subscribe === 'function' && !subscribed) {
			try {
				subscribe(() => {
					if (active) for (const listener of listeners) listener()
				})
				subscribed = true
			} catch (error) {
				reportError(`${TAG} profile store subscription failed:`, error)
			}
		}
		return true
	}

	// The flux Stores proxy answers from early on every build; on 350.4 the imported-path finder
	// alone never fired at startup, which made badges wait for the user to open a profile (the
	// only thing that initialised the module). The path finder stays as the fallback.
	try {
		bind((Stores as any)?.UserProfileStore)
	} catch (error) {
		reportError(`${TAG} profile store lookup failed:`, error)
	}

	// A tester on 351.2 got "found but unusable" at startup with neither candidate bindable yet
	// (2026-10-14, their log, not reproducible here). Rather than give up for the session, retry
	// whenever a badge asks, and only report if it's still unusable a while after launch.
	let profileModule: any
	let lastTry = 0
	retryBind = () => {
		if (store) return true
		const now = Date.now()
		if (now - lastTry < 1_000) return false
		lastTry = now
		try {
			const bound = bind((Stores as any)?.UserProfileStore) || bind(profileModule) || bind(profileModule?.default)
			// Rows drawn before the store bound are waiting on it; redraw them.
			if (bound) Promise.resolve().then(() => active && listeners.forEach(listener => listener()))
			return bound
		} catch {
			return false
		}
	}
	undo.push(
		getModuleByPath(PROFILE_STORE, null, (mod: any) => {
			profileModule = mod
			// Usually the Stores proxy above already bound it; then this is the same store, not a failure.
			if (store || bind(mod) || bind(mod?.default)) return
			const timer = setTimeout(() => {
				lastTry = 0
				if (!active || retryBind?.()) return
				// Name what it does have, so a renamed getter on a new build shows up in the log.
				reportError(
					`${TAG} profile store found but unusable; Stores proxy: ${describe((Stores as any)?.UserProfileStore)}; module: ${describe(mod)}; default: ${describe(mod?.default)}`,
				)
			}, 10_000)
			undo.push(() => clearTimeout(timer))
		}, TAG),
	)
	const { withProps } = filters
	undo.push(
		getModuleByPath(ACTIONS, withProps('fetchProfile', 'fetchCurrentUser'), (mod: any) => {
			const fn = mod?.fetchProfile ?? mod?.default?.fetchProfile
			if (typeof fn === 'function') {
				fetchProfile = fn
				pump()
			}
		}, TAG),
	)

	return () => {
		active = false
		for (const fn of undo.reverse()) {
			try {
				fn()
			} catch {
				/* already gone */
			}
		}
		store = undefined
		retryBind = undefined
		fetchProfile = undefined
		resetQueue()
	}
}

/** The getter-ish names on a store candidate and its prototype chain, for the unusable-store error. */
function describe(candidate: any): string {
	try {
		if (candidate == null) return String(candidate)
		if (typeof candidate !== 'object' && typeof candidate !== 'function') return typeof candidate
		const names = new Set<string>()
		for (let o = candidate; o && o !== Object.prototype && names.size < 200; o = Object.getPrototypeOf(o)) {
			for (const key of Object.getOwnPropertyNames(o)) if (/^(get|is|has)|profile/i.test(key)) names.add(key)
		}
		const name = candidate.getName?.() ?? candidate.displayName ?? candidate.constructor?.name
		return `${name ?? typeof candidate} [${[...names].slice(0, 40).join(', ') || 'no getters'}]`
	} catch (error) {
		return `unreadable (${error})`
	}
}

const listeners = new Set<() => void>()

/** Fires when a profile may have landed, for redrawing rows that were waiting on one. */
export function onProfileChange(listener: () => void): () => void {
	listeners.add(listener)
	return () => listeners.delete(listener)
}

/** The first non-empty pronouns value: guild profile first, then the user's own. */
export function discordPronouns(userId: string, guildId?: string): string | undefined {
	try {
		if (!store && !retryBind?.()) return undefined
		const guild = guildId ? store.getGuildMemberProfile?.(userId, guildId)?.pronouns : undefined
		const own = store.getUserProfile?.(userId)?.pronouns
		const value = typeof guild === 'string' && guild.trim() ? guild : typeof own === 'string' ? own : undefined
		return typeof value === 'string' && value.trim() ? value.trim() : undefined
	} catch {
		return undefined
	}
}

/**
 * Whether the store already holds what the badge needs. In a guild that's the guild member
 * profile, plus the user profile unless the guild one has its own pronouns: an empty guild field
 * falls back to the account's. Discord loads your own guild member profile early without your user
 * profile, so a guild profile alone left your own pronouns ("any") unfetched for the session.
 */
function loaded(userId: string, guildId?: string): boolean {
	try {
		if (!store) retryBind?.()
		const user = !!store?.getUserProfile?.(userId)
		if (!guildId) return user
		const member = store?.getGuildMemberProfile?.(userId, guildId)
		if (!member) return false
		return (typeof member.pronouns === 'string' && !!member.pronouns.trim()) || user
	} catch {
		return false
	}
}

// ---- The fetch queue ---------------------------------------------------------------------------

/** Spacing between starting profile requests: a busy channel shouldn't trip Discord's rate limit. */
const GAP_MS = 150
/** Requests in flight at once. One at a time took 10+ seconds to reach a busy channel's last author. */
const MAX_IN_FLIGHT = 3
/**
 * A request that hasn't answered by now is treated as failed and retried later. Before 0.4.5 one
 * request that never settled kept the queue "busy" for the rest of the session, so badges only
 * appeared for profiles the user opened (Discord fetches those itself). Seen on 351.3, 2026-10-18:
 * visible authors stayed unfetched while a direct fetchProfile answered in under 0.5 s.
 */
const TIMEOUT_MS = 8_000
const MAX_TRIES = 4
const RETRY_MS = [5_000, 30_000, 120_000]

/** `userId:guildId` → its attempt state. `done` keys are never fetched again this session. */
const jobs = new Map<string, { userId: string; guildId?: string; tries: number; notBefore: number; done: boolean; running: boolean }>()
let inFlight = 0
let timer: ReturnType<typeof setTimeout> | undefined

function resetQueue() {
	jobs.clear()
	inFlight = 0
	if (timer !== undefined) clearTimeout(timer)
	timer = undefined
}

function schedule(delay: number) {
	if (timer !== undefined) return
	timer = setTimeout(() => {
		timer = undefined
		pump()
	}, delay)
}

/** The newest due job: rows just drawn are the ones on screen. */
function nextJob(now: number): { job?: ReturnType<typeof jobs.get>; soonest: number } {
	let soonest = Number.POSITIVE_INFINITY
	const all = [...jobs.values()]
	for (let i = all.length - 1; i >= 0; i--) {
		const job = all[i]!
		if (job.done || job.running) continue
		if (loaded(job.userId, job.guildId)) {
			// Landed some other way (someone opened the profile).
			job.done = true
			continue
		}
		if (job.notBefore <= now) return { job, soonest }
		soonest = Math.min(soonest, job.notBefore)
	}
	return { soonest }
}

/** Starts the next due fetch while there's room; up to MAX_IN_FLIGHT at a time. */
function pump() {
	if (inFlight >= MAX_IN_FLIGHT || typeof fetchProfile !== 'function') return
	const now = Date.now()
	const { job, soonest } = nextJob(now)
	if (!job) {
		if (soonest !== Number.POSITIVE_INFINITY) schedule(soonest - now)
		return
	}
	inFlight++
	job.running = true
	job.tries++
	let settled = false
	const finish = (ok: boolean, retryAfterMs?: number) => {
		if (settled) return
		settled = true
		clearTimeout(timeout)
		inFlight--
		job.running = false
		if (ok || loaded(job.userId, job.guildId) || job.tries >= MAX_TRIES) {
			job.done = true
		} else {
			job.notBefore = Date.now() + Math.max(retryAfterMs ?? 0, RETRY_MS[job.tries - 1] ?? RETRY_MS[RETRY_MS.length - 1])
		}
		schedule(GAP_MS)
	}
	const timeout = setTimeout(() => finish(false), TIMEOUT_MS)
	try {
		const result: any = fetchProfile(job.userId, job.guildId ? { guildId: job.guildId } : undefined)
		if (result && typeof result.then === 'function') {
			result.then(
				() => finish(true),
				(error: any) => {
					// A 429 carries Discord's own wait in seconds.
					const retryAfter = Number(error?.body?.retry_after)
					finish(false, Number.isFinite(retryAfter) ? retryAfter * 1000 : undefined)
				},
			)
		} else {
			finish(true)
		}
	} catch (error) {
		reportError(`${TAG} profile fetch failed:`, error)
		finish(false)
	}
	// Room for another: start it after the gap.
	if (inFlight < MAX_IN_FLIGHT) schedule(GAP_MS)
}

/**
 * Queues a profile fetch when the store lacks what the badge needs: the guild member profile in a
 * guild (it can carry its own pronouns, and fetching it brings the user profile too), else the
 * user profile. Cheap to call on every render; each user/guild pair is fetched at most once per
 * session unless it fails, in which case it is retried with backoff.
 */
export function fetchOnMiss(userId: string, guildId?: string) {
	const key = `${userId}:${guildId ?? ''}`
	const existing = jobs.get(key)
	if (existing) {
		// Drawn again: move a waiting job to the front (the newest end) of the queue.
		if (!existing.done && !existing.running && existing.tries === 0) {
			jobs.delete(key)
			jobs.set(key, existing)
		}
		return
	}
	if (loaded(userId, guildId)) return
	jobs.set(key, { userId, guildId, tries: 0, notBefore: 0, done: false, running: false })
	schedule(0)
}
