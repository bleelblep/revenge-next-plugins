import { after } from '@revenge-mod/patcher'
import { DEFAULTS } from '../index'
import type { HideCallButtonsStorage } from '../index'

/**
 * Hides the call and camera controls this plugin knows about.
 *
 * One patch type throughout: `after` on the render React calls -- `.type` for the `React.memo`
 * wrappers, `.default` for the plain functions. Modules are found by Discord source path
 * (`getModuleWithImportedPath`, porting rule 3) rather than by export name, which is minified,
 * has no `max` budget of its own, and fires on `fileFinishedImporting` before a lazily-imported
 * consumer reads `default`.
 *
 * | Surface       | Source file                                                | Rule                                 |
 * | ------------- | ---------------------------------------------------------- | ------------------------------------ |
 * | User profile  | `user_profile/native/UserProfileContactButtons.tsx`         | drop the last action (the call)      |
 * | DM header     | `main_tabs_v2/.../channel/header/PrivateChannelButtons.tsx` | drop pressables carrying `disabled`  |
 * | Friends list  | `main_tabs_v2/.../user_list/UserRow.tsx`                    | drop the `call` action + its trailing |
 * | Voice channel | `voice_panel/.../buttons/VoicePanelVideoButton.tsx`         | render `null`                        |
 *
 * Rules locate a control by its position in its own row, never by icon or asset id, and no-op
 * when the shape is missing. Each surface logs its own outcome (porting rule 3).
 */

type Apply = (ret: any) => any

/** React elements only; `props.children` also holds strings, numbers, `null` and arrays. */
function isElement(node: any): boolean {
	return (
		node !== null &&
		typeof node === 'object' &&
		node.$$typeof !== undefined &&
		node.props !== null &&
		typeof node.props === 'object'
	)
}

const rebuild = (element: any, props: any): any =>
	(revenge as any).react.React.cloneElement(element, props)

/** Address in a tree: each step indexes `props.children`, except `-1` = the single non-array child. */
function getAtPath(root: any, path: number[]): any {
	let node = root
	for (const step of path) {
		if (!isElement(node)) return undefined
		node = step === -1 ? node.props.children : node.props.children?.[step]
	}
	return node
}

function replaceChildren(root: any, path: number[], children: any): any {
	if (path.length === 0) return rebuild(root, { children })
	const [head, ...rest] = path
	const current = root.props.children
	if (!Array.isArray(current)) return root
	const next = [...current]
	next[head] = replaceChildren(current[head], rest, children)
	return rebuild(root, { children: next })
}

/** Depth-first, document order: the path of every element carrying an `onPress`. */
function pressablePaths(root: any): number[][] {
	const found: number[][] = []
	const visit = (node: any, path: number[], depth: number) => {
		if (depth > 8 || !isElement(node)) return
		const kids = node.props.children
		if (isElement(kids)) {
			const child = [...path, -1]
			if (typeof kids.props.onPress === 'function') found.push(child)
			return visit(kids, child, depth + 1)
		}
		if (!Array.isArray(kids)) return
		for (let i = 0; i < kids.length; i++) {
			const kid = kids[i]
			if (!isElement(kid)) continue
			const child = [...path, i]
			if (typeof kid.props.onPress === 'function') found.push(child)
			visit(kid, child, depth + 1)
		}
	}
	visit(root, [], 0)
	return found
}

/**
 * Drop a row's last action without leaving an empty wrapper: climb while the subtree still holds
 * only that one pressable. A three-button profile row loses the call button itself (keeping the
 * message icon); a two-button row loses its whole half-width call cell, so the row collapses.
 */
function removeLastPressable(root: any): any {
	const paths = pressablePaths(root)
	if (paths.length < 2) return null
	const target = paths[paths.length - 1]

	// Subtree pressable counts only grow as the prefix shortens, so the first miss ends the walk.
	let chosen = target
	for (let len = target.length - 1; len >= 1; len--) {
		const prefix = target.slice(0, len)
		if (pressablePaths(getAtPath(root, prefix)).length !== 1) break
		chosen = prefix
	}

	const path = chosen.slice(0, -1)
	const container = getAtPath(root, path)
	if (!container || !Array.isArray(container.props.children)) return null
	const kept = container.props.children.filter(
		(_: any, i: number) => i !== chosen[chosen.length - 1],
	)
	return kept.length > 0 ? replaceChildren(root, path, kept) : null
}

/** Depth-first pass; `fn` rewrites each node, having already rewritten its children. */
function mapChildren(node: any, fn: (element: any) => any, depth = 0): any {
	if (depth > 10) return node
	if (Array.isArray(node)) {
		let changed = false
		const mapped = node.map(child => {
			const next = mapChildren(child, fn, depth + 1)
			if (next !== child) changed = true
			return next
		})
		return changed ? mapped : node
	}
	if (!isElement(node)) return node
	const children = node.props.children
	const next =
		children == null ? children : mapChildren(children, fn, depth + 1)
	return fn(next === children ? node : rebuild(node, { children: next }))
}

/**
 * User profile -- `UserProfileContactButtons`: its whole output is the action row (message + call,
 * or add-friend + message + call) with the call always last, and the profile draws no camera, so
 * only `upHideVoiceButton` acts here.
 */
function pruneProfile(root: any, st: HideCallButtonsStorage): any {
	if (!st.upHideVoiceButton || !isElement(root)) return root
	return removeLastPressable(root) ?? root
}

/**
 * DM header -- `PrivateChannelButtons`. Discord gives the call and video pressables a `disabled`
 * prop and the search / overflow ones none, which separates the groups without reaching for an
 * icon. Call first, video second; the App DM header renders only labelled pressables.
 */
function pruneDM(root: any, st: HideCallButtonsStorage): any {
	if ((!st.dmHideCallButton && !st.dmHideVideoButton) || !isElement(root))
		return root
	const children = root.props.children
	if (!Array.isArray(children)) return root

	const toggles = children.flatMap((child: any, i: number) =>
		isElement(child) &&
		typeof child.props.onPress === 'function' &&
		'disabled' in child.props
			? [i]
			: [],
	)
	const drop = new Set<number>()
	if (st.dmHideCallButton && toggles.length > 0) drop.add(toggles[0])
	if (st.dmHideVideoButton && toggles.length > 1) drop.add(toggles[1])
	if (drop.size === 0) return root
	const kept = children.filter((_: any, i: number) => !drop.has(i))
	return kept.length > 0 ? rebuild(root, { children: kept }) : root
}

/**
 * Friends list -- `UserRow`. `accessibilityActions` and the `trailing` buttons come from one
 * `useMemo`, so index `i` in one is index `i` in the other, and dropping `i` from both needs no
 * knowledge of what the button looks like. Drifted lists are skipped rather than misaligned.
 */
function pruneFriends(root: any, st: HideCallButtonsStorage): any {
	if (!st.friendsHideCallButton || !isElement(root)) return root
	return mapChildren(root, element => {
		const actions = element.props.accessibilityActions
		const trailing = element.props.trailing
		const buttons = trailing?.props?.children
		const index = Array.isArray(actions)
			? actions.findIndex((a: any) => String(a?.name).toLowerCase() === 'call')
			: -1
		if (
			index < 0 ||
			!Array.isArray(buttons) ||
			buttons.length !== actions.length
		)
			return element
		return rebuild(element, {
			accessibilityActions: actions.filter((_: any, i: number) => i !== index),
			trailing: rebuild(trailing, {
				children: buttons.filter((_: any, i: number) => i !== index),
			}),
		})
	})
}

export default function patchCallButtons(
	jsonStorage: RevengeJsonStorageApi<HideCallButtonsStorage>,
): () => void {
	const patches: Array<() => void> = []
	const settings = (): HideCallButtonsStorage =>
		(jsonStorage.cache as HideCallButtonsStorage | undefined) ?? DEFAULTS

	/** `after` on the render React calls, reached by the module's Discord source path. */
	const hook = (path: string, label: string, apply: Apply) => {
		patches.push(
			revenge.discord.utils.modules.finders.getModuleWithImportedPath(
				path,
				(ns: any) => {
					const target = ns?.default
					const memo =
						target !== null &&
						typeof target === 'object' &&
						typeof target.type === 'function'
					const owner = memo ? target : ns
					const key = memo ? 'type' : 'default'
					if (typeof owner?.[key] !== 'function')
						return console.warn(`[HideCallButtons] ${label}: nothing to patch`)
					console.log(`[HideCallButtons] ${label}: patched`)
					let logged = false
					patches.push(
						after(owner, key, (ret: any) => {
							try {
								const out = apply(ret)
								if (!logged) {
									logged = true
									console.log(
										`[HideCallButtons] ${label}: ${out === ret ? 'unchanged' : 'changed'}`,
									)
								}
								return out
							} catch (error) {
								console.error(`[HideCallButtons] ${label}:`, error)
								return ret
							}
						}),
					)
				},
			),
		)
	}

	hook(
		'modules/user_profile/native/UserProfileContactButtons.tsx',
		'profile',
		ret => pruneProfile(ret, settings()),
	)
	hook(
		'modules/main_tabs_v2/native/channel/header/PrivateChannelButtons.tsx',
		'dm header',
		ret => pruneDM(ret, settings()),
	)
	hook(
		'modules/main_tabs_v2/native/shared_components/user_list/UserRow.tsx',
		'friends row',
		ret => pruneFriends(ret, settings()),
	)
	hook(
		'modules/voice_panel/native/controls/buttons/VoicePanelVideoButton.tsx',
		'voice camera',
		ret => (settings().hideVCVideoButton ? null : ret),
	)

	return () => {
		for (const unpatch of patches) {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		}
		patches.length = 0
	}
}
