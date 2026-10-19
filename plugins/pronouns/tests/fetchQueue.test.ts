// @ts-nocheck -- bun:test has no type declarations in this repo; run with `bun test`.
import { afterAll, beforeAll, expect, mock, test } from 'bun:test'

/*
 * The profile fetch queue in js/lib/discord.ts, against a fake Discord: a profile store, and a
 * fetchProfile that answers after a delay, or never. Run with `bun test`.
 */

const profiles = new Map<string, { pronouns?: string }>()
const members = new Map<string, { pronouns?: string }>()
const calls: string[] = []
/** userId → how fetchProfile behaves: answer after ms, or never. */
const behaviour = new Map<string, number | 'never'>()

const fakeStore = {
	getUserProfile: (id: string) => profiles.get(id),
	getGuildMemberProfile: (id: string, guild: string) => members.get(`${id}:${guild}`),
	addChangeListener: () => {},
}

function fetchProfile(userId: string, options?: { guildId?: string }) {
	calls.push(userId)
	const how = behaviour.get(userId) ?? 50
	if (how === 'never') return new Promise(() => {})
	return new Promise<void>(resolve =>
		setTimeout(() => {
			profiles.set(userId, { pronouns: 'any' })
			if (options?.guildId) members.set(`${userId}:${options.guildId}`, {})
			resolve()
		}, how),
	)
}

mock.module('@revenge-mod/discord/flux', () => ({ Stores: { UserProfileStore: fakeStore } }))
mock.module('@revenge-mod/modules/finders/filters', () => ({ withProps: () => () => false }))
mock.module('../../../shared/report', () => ({ reportError: () => {} }))
mock.module('../../../shared/modules', () => ({
	getModuleByPath: (path: string, _fallback: unknown, callback: (mod: any) => void) => {
		if (path.includes('UserActionCreators')) callback({ fetchProfile, fetchCurrentUser: () => {} })
		return () => {}
	},
}))

const discord = await import('../js/lib/discord')
let stop: () => void

beforeAll(() => {
	stop = discord.watchDiscord()
})
afterAll(() => stop?.())

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

test('a fetch that never answers does not block the others', async () => {
	behaviour.set('stuck', 'never')
	discord.fetchOnMiss('stuck', 'g')
	for (let i = 0; i < 10; i++) discord.fetchOnMiss(`user${i}`, 'g')
	await wait(2_500)
	for (let i = 0; i < 10; i++) expect(discord.discordPronouns(`user${i}`, 'g')).toBe('any')
	expect(discord.discordPronouns('stuck', 'g')).toBeUndefined()
})

test('a busy channel loads within a couple of seconds', async () => {
	const started = Date.now()
	for (let i = 0; i < 20; i++) discord.fetchOnMiss(`busy${i}`, 'g2')
	while (Date.now() - started < 5_000) {
		if ([...Array(20).keys()].every(i => discord.discordPronouns(`busy${i}`, 'g2'))) break
		await wait(50)
	}
	const took = Date.now() - started
	expect([...Array(20).keys()].every(i => discord.discordPronouns(`busy${i}`, 'g2') === 'any')).toBe(true)
	// 20 authors, 50 ms each, 3 at a time with 150 ms between starts: about 1-2 s, not 7+.
	expect(took).toBeLessThan(4_000)
})

test('account pronouns show in a server whose member profile has none', async () => {
	profiles.delete('me')
	members.set('me:g3', {})
	discord.fetchOnMiss('me', 'g3')
	await wait(600)
	expect(calls).toContain('me')
	expect(discord.discordPronouns('me', 'g3')).toBe('any')
})

test('newest requests go first', async () => {
	calls.length = 0
	for (let i = 0; i < 8; i++) discord.fetchOnMiss(`order${i}`, 'g4')
	await wait(30)
	// The newest is started first (the first few may start before the rest are queued).
	expect(calls.indexOf('order7')).toBeLessThan(calls.indexOf('order3') === -1 ? Infinity : calls.indexOf('order3'))
})
