/**
 * Long-press a server avatar on a profile for the person's main avatar (the tap shows the server
 * one). The original plugin's long-press.
 *
 * `HeaderAvatar` (modules/profile_customization/native/HeaderAvatar.tsx, a forwardRef) renders a
 * PressableOpacity with `onLongPress: onPress` whenever it's openable, so a long-press just repeats
 * the tap. A `before` on its `render` stashes the props, and the `after` swaps `onLongPress` on the
 * returned pressable. Only when there's an `onPress` (a profile avatar Discord already made
 * openable), so avatars elsewhere don't turn into buttons.
 */

import { FULL_SIZE, fullSize, openImage, TAG } from '../lib/media'

const PATH = 'modules/profile_customization/native/HeaderAvatar.tsx'

function otherAvatar(user: any, guildId: string | undefined): string | undefined {
	try {
		// Only a server avatar has an "other" picture: the tap shows it, so long-press shows the main
		// one. Without one, the long-press keeps doing what the tap does.
		if (!guildId || !user?.hasAvatarForGuild?.(guildId)) return undefined
		const url = user.getAvatarURL(undefined, FULL_SIZE, true)
		if (typeof url === "string") return fullSize(url)
	} catch (error) {
		console.error(`${TAG} avatar URL failed:`, error)
	}
	return undefined
}

export default function patchAvatar(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			const target = mod?.default
			if (typeof target?.render !== 'function') {
				console.error(`${TAG} HeaderAvatar.render not found`)
				return
			}
			patches.push(
				revenge.patcher.before(target, 'render', (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				revenge.patcher.after(target, 'render', (ret: any) => {
					const props = lastProps
					lastProps = undefined
					try {
						if (!ret?.props || typeof ret.props.onPress !== 'function' || !props?.user) return ret
						const url = otherAvatar(props.user, props.guildId)
						if (!url) return ret
						const React = revenge.react.React
						return React.cloneElement(ret, {
							onLongPress: () => openImage(url),
						})
					} catch (error) {
						console.error(`${TAG} avatar long-press failed:`, error)
						return ret
					}
				}),
			)
			console.log(`${TAG} hooked HeaderAvatar`)
		} catch (error) {
			console.error(`${TAG} failed to hook HeaderAvatar:`, error)
		}
	}

	try {
		unsubscribe = (revenge.discord.utils.modules.finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		console.error(`${TAG} HeaderAvatar lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
