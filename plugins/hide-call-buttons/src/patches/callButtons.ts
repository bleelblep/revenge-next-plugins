import { DEFAULTS, type HideCallButtonsStorage } from "../index"

/**
 * Matches a module by the *wrapped* component's name (`exports.type.name`), which is what
 * Vendetta's `find(x => x?.type?.name === "...")` did. `withName` only checks `.name`, which
 * memo/forwardRef wrappers don't have.
 *
 * Shaped like the built-in filters (predicate + `.key`/`.flags`/`.scopes`), and `.scope(...)`
 * must be a **method** -- getModules calls it as a function. See docs/porting-rules.md rule 3.
 */
function withTypeName(name: string) {
	const filter: any = (_id: number, exports: any) => exports?.type?.name === name
	filter.key = `revenge-next-plugins.typeName(${name})`
	filter.flags = 1 // FilterFlag.RequiresExports
	filter.scopes = 4 // FilterScopes.Initialized
	filter.scope = (...scopes: number[]) => {
		const scoped: any = (id: number, exports: any) => filter(id, exports)
		scoped.key = filter.key
		scoped.flags = filter.flags
		scoped.scopes = scopes.reduce((a, b) => a | b, 0)
		scoped.scope = filter.scope
		return scoped
	}
	return filter
}

type ButtonKind = "voice" | "video"

interface Assets {
	voice?: number
	video?: number
	call?: number
	callNew?: number
	dmVideo?: number
	dmVideoNew?: number
}

/**
 * Icon *components* the buttons render, as of 337-340. `PhoneHangUpIcon` is deliberately absent:
 * that is the button that ends a call in progress, and hiding it would trap the user in one.
 */
const VOICE_ICONS = new Set(["PhoneCallIcon", "VoiceCallIcon", "CallIcon", "PhoneIcon"])
const VIDEO_ICONS = new Set(["VideoIcon", "VideoCallIcon"])

/** How deep into a button row to look. The deepest real nesting is 4 (group > row > pressable > icon). */
const MAX_DEPTH = 8

/** Resolves the asset ids older builds compare against, with legacy fallbacks. */
function resolveAssets(): Assets {
	const { getAssetIdByName } = revenge.assets
	return {
		// Profile buttons compared against `props.icon`.
		voice: getAssetIdByName("ic_audio") ?? getAssetIdByName("PhoneCallIcon"),
		video: getAssetIdByName("ic_video") ?? getAssetIdByName("VideoIcon"),
		// DM header buttons compared against `props.source`, and appeared under either the old
		// or the new asset names depending on build.
		call: getAssetIdByName("nav_header_connect"),
		callNew: getAssetIdByName("PhoneCallIcon"),
		dmVideo: getAssetIdByName("video"),
		dmVideoNew: getAssetIdByName("VideoIcon"),
	}
}

/** The name of the icon component behind a component reference, an element, or a wrapper. */
function iconName(icon: any): string | undefined {
	if (typeof icon === "function") return icon.name || icon.displayName
	if (icon === null || typeof icon !== "object") return undefined
	// A rendered element -- `<PhoneCallIcon size="xs" />` -- carries the component on `.type`.
	const type = icon.type
	if (typeof type === "function") return type.name || type.displayName
	if (type !== null && typeof type === "object") return type.displayName || type.type?.name
	return icon.displayName
}

/**
 * Identifies a node as a call or video button by what it draws, never by where it sits. Current
 * builds pass an icon *component* (`<Button icon={<PhoneCallIcon />}>` on profiles,
 * `<PressableOpacity><PhoneCallIcon /></PressableOpacity>` on DM headers); older builds passed an
 * asset id on `props.icon` or `props.source`.
 */
function classifyIcon(node: any, assets: Assets): ButtonKind | undefined {
	const props = node?.props

	for (const id of [props?.icon, props?.source]) {
		if (typeof id !== "number") continue
		if (id === assets.voice || id === assets.call || id === assets.callNew) return "voice"
		if (id === assets.video || id === assets.dmVideo || id === assets.dmVideoNew) return "video"
	}

	for (const name of [iconName(node), iconName(props?.icon), iconName(props?.IconComponent)]) {
		if (name === undefined) continue
		if (VOICE_ICONS.has(name)) return "voice"
		if (VIDEO_ICONS.has(name)) return "video"
	}

	return undefined
}

/**
 * Bounded, read-only search for a call/video icon anywhere just below `node` -- used to tell
 * whether a *pressable* (not the icon itself) is a hidden button, without walking the whole tree.
 */
function findIconKind(node: any, assets: Assets, depth = 0, maxDepth = 4): ButtonKind | undefined {
	if (node === null || typeof node !== "object" || depth > maxDepth) return undefined

	const direct = classifyIcon(node, assets)
	if (direct !== undefined) return direct

	const children = node.props?.children
	if (Array.isArray(children)) {
		for (const child of children) {
			const kind = findIconKind(child, assets, depth + 1, maxDepth)
			if (kind !== undefined) return kind
		}
		return undefined
	}
	if (children !== null && typeof children === "object") {
		return findIconKind(children, assets, depth + 1, maxDepth)
	}
	return undefined
}

/**
 * A node is a hidden button either because it *is* the icon, or because it's the pressable that
 * draws one. The pressable case matters: DM header buttons wrap the icon alongside a ripple layer
 * or other always-present sibling, so "remove the icon, collapse the wrapper if everything inside
 * it was removed" never collapses -- the wrapper survives with `onPress` intact and renders as a
 * blank, still-tappable button. Classifying the pressable itself means the *whole* thing is
 * dropped in one shot, regardless of what else lives inside it.
 */
function classify(node: any, assets: Assets): ButtonKind | undefined {
	const direct = classifyIcon(node, assets)
	if (direct !== undefined) return direct

	if (typeof node?.props?.onPress === "function") return findIconKind(node, assets)

	return undefined
}

/**
 * Drops every hidden button in `node`'s subtree. Returns true when `node` itself should be
 * dropped by its parent -- either it *is* a hidden button, or it is a wrapper whose entire
 * contents were hidden and which would otherwise render as an empty gap.
 *
 * Only child *arrays* are written to; `props` objects are left alone, since a wrapper is removed
 * by its parent rather than emptied in place.
 */
function prune(
	node: any,
	depth: number,
	hidden: (kind: ButtonKind) => boolean,
	assets: Assets,
): boolean {
	if (node === null || typeof node !== "object") return false

	const kind = classify(node, assets)
	if (kind !== undefined) return hidden(kind)

	if (depth >= MAX_DEPTH) return false

	const children = node.props?.children
	if (Array.isArray(children)) {
		let removed = 0
		let kept = 0
		for (let idx = 0; idx < children.length; idx++) {
			const child = children[idx]
			if (child === null || child === undefined || child === false) continue
			if (prune(child, depth + 1, hidden, assets)) {
				children[idx] = null
				removed++
			} else kept++
		}
		return removed > 0 && kept === 0
	}

	if (children !== null && typeof children === "object") {
		return prune(children, depth + 1, hidden, assets)
	}

	return false
}

export default function patchCallButtons(
	jsonStorage: RevengeJsonStorageApi<HideCallButtonsStorage>,
): () => void {
	const { getModules } = revenge.modules.finders
	const { withName, withProps } = revenge.modules.finders.filters
	const { after, instead } = revenge.patcher

	const patches: Array<() => void> = []
	const s = () => jsonStorage.cache ?? DEFAULTS

	// Assets are registered before anything renders, so one resolve covers every later render.
	let assets: Assets | undefined
	const getAssets = () => (assets ??= resolveAssets())

	/**
	 * Hides whichever of the two buttons the given settings turn off. `component` is returned
	 * unchanged -- the pruning happens in place, on the child arrays.
	 */
	const hideIn = (component: any, voice: boolean, video: boolean) => {
		if (!voice && !video) return component
		prune(component, 0, kind => (kind === "voice" ? voice : video), getAssets())
		return component
	}

	const hideProfileButtons = (component: any) =>
		hideIn(component, s().upHideVoiceButton, s().upHideVideoButton)

	const hideDMButtons = (component: any) =>
		hideIn(component, s().dmHideCallButton, s().dmHideVideoButton)

	// Every surface is applied independently -- one Discord rename must disable one surface,
	// not the whole plugin.
	const apply = (label: string, fn: () => void) => {
		try {
			fn()
		} catch (error) {
			console.error(`[HideCallButtons] failed to patch ${label}:`, error)
		}
	}

	// NOTE: this patcher's `after` hook receives only the return value, and its return value is
	// assigned unconditionally -- so every hook below must return `component`. Vendetta's
	// `after` treated `undefined` as "keep the original", which is why the source these are
	// ported from returns nothing. See docs/porting-rules.md rule 2.

	// --- User profile (full) ---
	apply("UserProfileActions", () => {
		patches.push(
			getModules(withName("UserProfileActions"), (mod: any) => {
				patches.push(after(mod, "default", hideProfileButtons))
			}, { returnNamespace: true }),
		)
	})

	// --- User profile (simplified) ---
	apply("SimplifiedUserProfileContactButtons", () => {
		const patchContactButtons = (mod: any) => {
			patches.push(after(mod, "default", hideProfileButtons))
		}
		// Renamed at some point; whichever exists gets patched.
		patches.push(
			getModules(withName("SimplifiedUserProfileContactButtons"), patchContactButtons, {
				returnNamespace: true,
			}),
		)
		patches.push(
			getModules(withName("UserProfileContactButtons"), patchContactButtons, {
				returnNamespace: true,
			}),
		)
	})

	// --- Voice channel video button ---
	apply("VideoButton", () => {
		patches.push(
			getModules(withName("VideoButton"), (mod: any) => {
				patches.push(
					instead(mod, "default", function (this: any, args: any[], original: any) {
						if (s().hideVCVideoButton) return undefined
						if (typeof original !== "function") return undefined
						return Reflect.apply(original, this, args)
					}),
				)
			}, { returnNamespace: true }),
		)
	})

	// --- Tabs V2 DM header ---
	apply("PrivateChannelButtons", () => {
		patches.push(
			getModules(withTypeName("PrivateChannelButtons"), (mod: any) => {
				patches.push(after(mod, "type", hideDMButtons))
			}),
		)
	})

	// --- Legacy DM header ---
	apply("ChannelButtons", () => {
		patches.push(
			getModules(withProps("ChannelButtons"), (mod: any) => {
				patches.push(after(mod, "ChannelButtons", hideDMButtons))
			}, { returnNamespace: true }),
		)
	})

	return () => {
		for (const unpatch of patches) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
	}
}
