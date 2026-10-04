/// <reference types="node" />
import { afterEach, beforeEach, describe, test } from "node:test"
import assert from "node:assert/strict"
import { resetAliases } from "../js/lib/alias"
import { redactPresentation } from "../js/lib/presentation"
import { patchResolver, resolverHosts, ResolverSlots } from "../js/lib/resolverHooks"
import { redactMessage } from "../js/lib/rowSchema"
import { isEnabled, preserveOriginalResolution, setStorage, withOriginalResolution } from "../js/lib/state"
import { rememberOriginal, resetOriginals } from "../js/lib/originals"
import { applyBatch, noteCleared, refreshChat, resetChatRows, setChatBridge } from "../js/lib/chatRows"
import patchUserSurfaces from "../js/patches/userSurfaces"
import { watchRedactionSettings } from "../js/lib/settingsRefresh"
import { cancelScheduledRefresh } from "../js/lib/refreshSignal"

const userId = "123456789012345678"
const otherId = "223456789012345678"
const options = { enabled: true, resolved: true, style: "pseudonym" as const, self: true, avatars: true, badges: true }
const element = (type: any, props: any) => ({ type, props, element: true })

beforeEach(() => {
	resetAliases()
	resetOriginals()
	;(globalThis as any).revenge = {
		react: { React: {
			isValidElement: (node: any) => node?.element === true,
			cloneElement: (node: any, patch: any) => element(node.type, { ...node.props, ...patch }),
		} },
		discord: { flux: { Stores: {} }, common: {} },
	}
	setStorage({ cache: { enabled: true } } as any)
})

afterEach(() => {
	cancelScheduledRefresh()
	resetChatRows()
	setChatBridge(undefined)
})

describe("presentation boundaries", () => {
	test("reaction labels redact both nick and raw username without changing the store record", () => {
		const user = { id: userId, username: "real_handle", globalName: "Real name" }
		const tree = element("row", {
			label: element("identity", { user, nick: "Guild nickname" }),
			leading: element("Avatar", { source: { uri: "real-photo" }, size: 32 }),
			onPress: () => user.id,
		})
		const redacted = redactPresentation(tree, userId, options)
		assert.equal(redacted.props.label.props.nick, "User 1")
		assert.equal(redacted.props.label.props.user.username, "User 1")
		assert.match(redacted.props.leading.props.source.uri, /\/embed\/avatars\//)
		assert.equal(redacted.props.onPress(), userId)
		assert.equal(user.username, "real_handle")
		assert.equal(tree.props.leading.props.source.uri, "real-photo")
		assert.equal(redactPresentation(tree, userId, { ...options, enabled: false }), tree)
	})

	test("avatar setting and self exclusion apply across presentation surfaces", () => {
		const tree = element("row", { label: element("identity", { user: { id: userId, username: "real" }, nick: "real" }), leading: element("Avatar", { size: 32, source: 5 }) })
		assert.equal(redactPresentation(tree, userId, { ...options, self: false, selfId: userId }), tree)
		const namesOnly = redactPresentation(tree, userId, { ...options, avatars: false })
		assert.equal(namesOnly.props.label.props.user.username, "User 1")
		assert.equal(namesOnly.props.leading.props.source, 5)
	})

	test("original-resolution scope nests and restores redaction after exceptions", () => {
		assert.equal(isEnabled(), true)
		assert.throws(() => withOriginalResolution(() => {
			assert.equal(isEnabled(), false)
			withOriginalResolution(() => assert.equal(isEnabled(), false))
			throw Error("render failed")
		}), /render failed/)
		assert.equal(isEnabled(), true)
	})
})

describe("resolver exports", () => {
	test("named and default slots need separate hooks even for the same function", () => {
		const getName = () => "real"
		const mod = { getName, default: { getName } }
		const slots = new ResolverSlots()
		const hosts = resolverHosts(mod, "getName")
		assert.equal(hosts.length, 2)
		slots.add(mod, "getName")
		assert.equal(slots.has(mod.default, "getName"), false)
	})

	test("nested calls retain their own user and cleanup restores the original method", () => {
		const host = { resolve: (id: string): string => id === userId ? `${host.resolve(otherId)}:outer` : "inner" }
		const original = host.resolve
		let before: any
		let after: any
		;(globalThis as any).revenge.patcher = {
			before: (_host: any, _key: string, hook: any) => {
				before = hook
				host.resolve = ((...args: any[]) => after(Reflect.apply(original, host, before(args)))) as any
				return () => { host.resolve = original }
			},
			after: (_host: any, _key: string, hook: any) => { after = hook; return () => {} },
		}
		const stop = patchResolver(host, "resolve", args => args[0], (_ret, id) => id)
		assert.equal(host.resolve(userId), userId)
		stop()
		assert.equal(host.resolve, original)
	})
})

test("reply previews and parsed mentions stay reversible when their source is cached", () => {
	const preview = { authorId: otherId, username: "Reply author", content: [] }
	const content = [{ type: "mention", userId: otherId, content: [{ content: "@Reply author" }] }]
	const message = { authorId: userId, username: "Me", content, referencedMessage: { message: preview } }
	redactMessage(message, { ...options, self: false, selfId: userId })
	// Self excluded, but the other person in both the mention and the reply is still covered.
	assert.equal(message.username, "Me")
	assert.equal(message.referencedMessage.message.username, "User 1")
	assert.equal(preview.username, "Reply author")
	assert.equal(content[0].content[0].content, "@Reply author")
})

test("native replay restores original rows and reports missing bridges honestly", () => {
	const source = [{ index: 0, changeType: 1, message: { id: "message", authorId: userId, username: "Real" } }]
	noteCleared(1)
	applyBatch(1, source)
	let pushed: any[] = []
	setChatBridge({ clear: () => {}, push: (_tag, rows) => { pushed = rows } })
	assert.match(refreshChat()!, /repainted 1 chat list/)
	assert.equal(pushed[0].message.username, "User 1")
	setStorage({ cache: { enabled: false } } as any)
	refreshChat()
	assert.equal(pushed[0].message.username, "Real")
	assert.equal(source[0].message.username, "Real")
	setChatBridge(undefined)
	assert.equal(refreshChat(), undefined)
})

test("mounted member and reaction boundaries hide, change style, and restore without navigation", () => {
	const api = (globalThis as any).revenge
	const user = { id: userId, username: "real_handle", globalName: "Real name" }
	const originalRow = element("TableRow", { label: "Guild nickname", subLabel: "Personal status", leading: element("Avatar", { user, size: 32 }) })
	// Simulate Discord returning the same memoized element on every render.
	const member = { type: () => originalRow }
	const reactionRow = element("row", { label: element("identity", { user, nick: "Guild nickname" }), leading: element("Avatar", { size: 32, source: { uri: "real-photo" } }) })
	const reactions = { MessageReactionsContent: () => element("list", { renderItem: () => reactionRow }) }
	api.react.React.createElement = element
	api.react.React.useSyncExternalStore = () => 0
	api.discord.utils = { modules: { finders: { getModuleWithImportedPath: (path: string, callback: any) => {
		callback(path.endsWith("/UserRow.tsx") ? { default: member } : reactions)
		return () => {}
	} } } }
	api.modules = { finders: { lookupModules: () => [], waitForModules: () => () => {}, filters: { withProps: () => null } } }
	api.patcher = { after: (host: any, key: string, hook: any) => {
		const original = host[key]
		host[key] = (...args: any[]) => hook(original(...args))
		return () => { host[key] = original }
	} }
	const stop = patchUserSurfaces()
	const storage = { cache: { enabled: true, style: "pseudonym" }, use: () => storage.cache }
	setStorage(storage as any)
	const renderMember = () => (member.type as any)({ user })
	const reactionBoundary = (reactions.MessageReactionsContent() as any).props.renderItem(0, 0)
	const renderReaction = () => reactionBoundary.type(reactionBoundary.props)
	assert.equal(renderMember().props.label, "User 1")
	assert.equal(renderReaction().props.label.props.user.username, "User 1")
	storage.cache.style = "initial"
	assert.equal(renderMember().props.label, "U1")
	assert.equal(renderReaction().props.label.props.nick, "U1")
	storage.cache.enabled = false
	assert.equal(renderMember(), originalRow)
	assert.equal(renderReaction(), reactionRow)
	assert.equal(user.username, "real_handle")
	stop()
	assert.equal(member.type(), originalRow)
})

test("settings subscription coalesces updates, avoids duplicate replay, and stops on cleanup", async () => {
	let listener: (() => void) | undefined
	const storage = {
		cache: { enabled: false, style: "pseudonym" },
		subscribe: (callback: () => void) => {
			listener = callback
			return () => { listener = undefined }
		},
	}
	setStorage(storage as any)
	noteCleared(1)
	applyBatch(1, [{ index: 0, changeType: 1, message: { id: "settings-test", authorId: userId, username: "Real" } }])
	let replays = 0
	let lastName: string | undefined
	setChatBridge({ clear: () => {}, push: (_tag, rows) => {
		replays++
		lastName = rows[0].message.username
	} })
	const stop = watchRedactionSettings(storage as any)
	storage.cache.enabled = true
	listener?.()
	storage.cache.style = "initial"
	listener?.()
	await new Promise(resolve => setTimeout(resolve, 20))
	assert.equal(replays, 1)
	assert.equal(lastName, "U1")
	storage.cache.enabled = false
	listener?.()
	refreshChat()
	await new Promise(resolve => setTimeout(resolve, 20))
	assert.equal(replays, 2)
	assert.equal(lastName, "Real")
	storage.cache.enabled = true
	listener?.()
	stop()
	await new Promise(resolve => setTimeout(resolve, 20))
	assert.equal(replays, 2)
	assert.equal(listener, undefined)
})

test("opening a DM while enabled saves a real name for off-edge replay", () => {
	const producer = {
		name: "Real DM name",
		generate() {
			return { id: "dm-original", authorId: userId, username: isEnabled() ? "User 52" : this.name }
		},
	}
	const original = producer.generate
	const stop = preserveOriginalResolution(producer, "generate")
	const generated = producer.generate()
	assert.equal(isEnabled(), true)
	assert.equal(generated.username, "Real DM name")
	rememberOriginal(generated)
	const outgoing = { ...generated }
	redactMessage(outgoing, options)
	assert.equal(outgoing.username, "User 1")
	assert.equal(generated.username, "Real DM name")
	noteCleared(42)
	applyBatch(42, [{ index: 0, changeType: 1, message: outgoing }])
	setStorage({ cache: { enabled: false } } as any)
	let restored: any
	setChatBridge({ clear: () => {}, push: (_tag, rows) => { restored = rows[0].message } })
	refreshChat()
	assert.equal(restored.username, "Real DM name")
	stop()
	assert.equal(producer.generate, original)
})
