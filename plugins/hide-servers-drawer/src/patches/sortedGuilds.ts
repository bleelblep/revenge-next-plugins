import { isEmpty, isFolderHidden, isHidden } from "../lib/hidden"

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
const { SortedGuildStore } = revenge.discord.flux.Stores

// No server-list component resolves reliably by name across builds, so filter at the
// source instead: everything that draws the list reads it from this store, so removing
// hidden guilds here hides them everywhere without locating a single component.

/**
 * Shallow-clone preserving the prototype.
 *
 * These store values are class instances, not plain objects. Object spread copies only own
 * enumerable properties and drops the prototype, which can crash methods like
 * getGuildBarNeighbors with "undefined is not a function". Never spread them.
 */
function clone<T extends object>(value: T): T {
	const out = Object.create(Object.getPrototypeOf(value))
	Object.assign(out, value)
	return out
}

/**
 * Guild ids sitting inside a hidden folder. getFlattenedGuildIds/getFlattenedGuilds/
 * getGuildIds have no folder context of their own -- they're just id arrays -- so hiding a
 * folder has to be cross-referenced against the tree to know which flattened ids it covers.
 * Built fresh per filter call from the *unfiltered* tree so a folder that's itself hidden
 * doesn't disappear from this lookup before it's been consulted.
 */
function hiddenFolderGuildIds(): Set<string> {
	const out = new Set<string>()

	try {
		const tree = unfiltered(() => SortedGuildStore?.getGuildsTree?.())
		const children = tree?.root?.children
		if (!Array.isArray(children)) return out

		for (const node of children) {
			if (node?.type !== "folder" || node.id == null || !isFolderHidden(node.id)) continue
			for (const child of node.children ?? []) {
				if (child?.id != null) out.add(String(child.id))
			}
		}
	} catch {
		/* best effort -- getFlattenedGuildIds/getGuildFolders just won't reflect it */
	}

	return out
}

/** Never mutate what the store returns -- other consumers share these objects. */
function filterIds(ids: unknown): unknown {
	if (!Array.isArray(ids)) return ids
	const hiddenInFolders = hiddenFolderGuildIds()
	return ids.filter(id => typeof id !== "string" || (!isHidden(id) && !hiddenInFolders.has(id)))
}

function filterFolders(folders: unknown): unknown {
	if (!Array.isArray(folders)) return folders

	return folders
		// Whole folder hidden: drop it outright, guildIds included.
		.filter(folder => !(folder?.folderId != null && isFolderHidden(folder.folderId)))
		.map(folder => {
			if (!folder || !Array.isArray(folder.guildIds)) return folder

			const guildIds = folder.guildIds.filter((id: string) => !isHidden(id))
			if (guildIds.length === folder.guildIds.length) return folder

			const next = clone(folder)
			next.guildIds = guildIds
			return next
		})
		// Drop folders that are now empty, but keep real (named) folders so the user's
		// organisation survives round-tripping.
		.filter(folder => !folder || !Array.isArray(folder.guildIds) || folder.guildIds.length > 0 || folder.folderId)
}

// getGuildsTree() returns:
//   { root: { type: "root", children: [...] },
//     nodes: { [id]: { type: "guild" | "folder", id, children: [...] } },
//     version: number }
//
// `nodes` is an object map keyed by id, not an array, and folder ids are numbers while
// guild ids are strings.
const isHiddenNode = (node: any) =>
	(node?.type === "guild" && node.id != null && isHidden(String(node.id))) ||
	(node?.type === "folder" && node.id != null && isFolderHidden(node.id))

function filterChildren(children: any[]): any[] {
	const out: any[] = []

	for (const child of children) {
		if (isHiddenNode(child)) continue

		if (Array.isArray(child?.children) && child.children.length) {
			const kids = filterChildren(child.children)

			// Keep folders even when emptied. Dropping them left dangling parentId
			// references and crashed the row component.
			if (kids.length === child.children.length) {
				out.push(child)
			} else {
				const next = clone(child)
				next.children = kids
				out.push(next)
			}
		} else {
			out.push(child)
		}
	}

	return out
}

/**
 * Only `root.children` decides what renders. `nodes` is a lookup table keyed by id, so
 * entries are left in place deliberately -- deleting them can make the row component
 * resolve a node to undefined and crash the whole server list. Extra unreferenced entries
 * are inert.
 */
function filterTree(tree: any): any {
	if (!tree || typeof tree !== "object") return tree
	if (!Array.isArray(tree.root?.children)) return tree

	const children = filterChildren(tree.root.children)
	if (children.length === tree.root.children.length) return tree

	const root = clone(tree.root)
	root.children = children

	const out = clone(tree)
	out.root = root
	return out
}

const TARGETS: Array<[string, (value: unknown) => unknown]> = [
	["getFlattenedGuildIds", filterIds],
	["getGuildFolders", filterFolders],
	["getGuildsTree", filterTree],
	// Present on some builds; patched only if they exist.
	["getFlattenedGuilds", filterIds],
	["getGuildIds", filterIds],
]

// These filters run on the server-list render path, where a throw takes down the whole
// server list. If anything goes wrong, stop filtering for the rest of the session rather
// than crashing repeatedly.
let disabled = false

/**
 * Run `fn` with filtering suspended.
 *
 * The settings page needs the *unfiltered* tree -- otherwise hidden servers disappear from
 * it too and there is no way to unhide them.
 */
export function unfiltered<T>(fn: () => T): T {
	const previous = disabled
	disabled = true
	try {
		return fn()
	} finally {
		disabled = previous
	}
}

/** The store, for callers that need to read it directly. */
export function store() {
	return SortedGuildStore
}

/**
 * Install one patch.
 *
 * Must stay a standalone function rather than a loop body: some downlevel transforms turn
 * `const` in `for...of` into `var`, which would make closures created inside the loop share
 * the final iteration's `method`/`filter`. Function parameters bind per call instead.
 */
function install(method: string, filter: (value: unknown) => unknown): (() => void) | undefined {
	if (typeof SortedGuildStore[method] !== "function") return undefined

	try {
		// after's hook receives only the return value (confirmed from revenge-bundle-next's
		// own patcher source) -- this patch only ever needed the result anyway, so no
		// conversion to instead is needed here (unlike the other .after( fixes elsewhere).
		return revenge.patcher.after(SortedGuildStore, method, (ret: unknown) => {
			// Skip the work entirely when nothing is hidden.
			if (disabled || isEmpty()) return ret

			try {
				return filter(ret)
			} catch {
				disabled = true
				return ret
			}
		})
	} catch {
		return undefined
	}
}

export default function patchSortedGuilds() {
	const patches: Array<() => void> = []

	if (!SortedGuildStore) return () => {}

	for (const target of TARGETS) {
		const unpatch = install(target[0], target[1])
		if (unpatch) patches.push(unpatch)
	}

	return () => patches.forEach(unpatch => { try { unpatch() } catch { /* already gone */ } })
}

/**
 * Nudge the UI after the hidden set changes.
 *
 * Tries both `doEmitChanges` (the classic-Revenge-confirmed name for this store) and the
 * more common `emitChange`, in case Revenge Next exposes it differently.
 */
export function refresh() {
	for (const method of ["doEmitChanges", "emitChange"]) {
		try {
			if (typeof SortedGuildStore?.[method] === "function") {
				SortedGuildStore[method]()
				return method
			}
		} catch {
			/* try the next one */
		}
	}

	return undefined
}

/** Names the store actually exposes, for diagnostics. */
export function emitterInfo() {
	const has = (m: string) => {
		try {
			return typeof SortedGuildStore?.[m] === "function"
		} catch {
			return false
		}
	}
	return { doEmitChanges: has("doEmitChanges"), emitChange: has("emitChange") }
}
