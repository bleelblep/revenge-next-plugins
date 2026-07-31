import type { HideCallButtonsStorage } from "../index"

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

/** Resolves the asset ids the button icons are compared against, with legacy fallbacks. */
function resolveAssets() {
	const { getAssetIdByName } = revenge.assets
	return {
		// Profile buttons compare against `props.icon`.
		voice: getAssetIdByName("ic_audio") ?? getAssetIdByName("PhoneCallIcon"),
		video: getAssetIdByName("ic_video") ?? getAssetIdByName("VideoIcon"),
		// DM header buttons compare against `props.source`, and appear under either the old
		// or the new asset names depending on build.
		call: getAssetIdByName("nav_header_connect"),
		callNew: getAssetIdByName("PhoneCallIcon"),
		dmVideo: getAssetIdByName("video"),
		dmVideoNew: getAssetIdByName("VideoIcon"),
	}
}

export default function patchCallButtons(
	jsonStorage: RevengeJsonStorageApi<HideCallButtonsStorage>,
): () => void {
	const { getModules } = revenge.modules.finders
	const { withName, withProps } = revenge.modules.finders.filters
	const { after, instead } = revenge.patcher

	const patches: Array<() => void> = []
	const s = () => jsonStorage.cache

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
			getModules<any>(withName("UserProfileActions"), mod => {
				patches.push(
					after(mod, "default", (component: any) => {
						if (!s().upHideVideoButton && !s().upHideVoiceButton) return component
						const assets = resolveAssets()

						let buttons =
							component?.props?.children?.props?.children?.[1]?.props?.children
						if (buttons === undefined) buttons = component?.props?.children?.[1]?.props?.children
						if (buttons?.props?.children !== undefined) buttons = buttons.props.children
						if (buttons === undefined) return component

						for (const idx in buttons) {
							const button = buttons[idx]

							if (button?.props?.children !== undefined) {
								const container = button.props.children
								for (const idx2 in container) {
									const btn = container[idx2]
									if (
										(btn?.props?.icon === assets.voice && s().upHideVoiceButton) ||
										(btn?.props?.icon === assets.video && s().upHideVideoButton)
									)
										delete container[idx2]
								}
							}

							if (button?.props?.IconComponent !== undefined) {
								if (s().upHideVoiceButton) delete buttons[1]
								if (s().upHideVideoButton) delete buttons[2]
							}

							if (
								(button?.props?.icon === assets.voice && s().upHideVoiceButton) ||
								(button?.props?.icon === assets.video && s().upHideVideoButton)
							)
								delete buttons[idx]
						}

						return component
					}),
				)
			}, { returnNamespace: true }),
		)
	})

	// --- User profile (simplified) ---
	apply("SimplifiedUserProfileContactButtons", () => {
		const patchContactButtons = (mod: any) => {
			patches.push(
				after(mod, "default", (component: any) => {
					const buttons = component?.props?.children
					if (buttons === undefined) return component
					if (s().upHideVoiceButton) delete buttons[1]
					if (s().upHideVideoButton) delete buttons[2]
					return component
				}),
			)
		}
		// Renamed at some point; whichever exists gets patched.
		patches.push(
			getModules<any>(withName("SimplifiedUserProfileContactButtons"), patchContactButtons, {
				returnNamespace: true,
			}),
		)
		patches.push(
			getModules<any>(withName("UserProfileContactButtons"), patchContactButtons, {
				returnNamespace: true,
			}),
		)
	})

	// --- Voice channel video button ---
	apply("VideoButton", () => {
		patches.push(
			getModules<any>(withName("VideoButton"), mod => {
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
			getModules<any>(withTypeName("PrivateChannelButtons"), mod => {
				patches.push(
					after(mod, "type", (component: any) => {
						if (!s().dmHideCallButton && !s().dmHideVideoButton) return component
						const assets = resolveAssets()

						let buttons = component?.props?.children
						if (buttons === undefined) return component

						if (buttons[0]?.props?.accessibilityLabel !== undefined) {
							if (s().dmHideCallButton) delete buttons[0]
							if (s().dmHideVideoButton) delete buttons[1]
							return component
						}

						if (buttons[0]?.props?.source === undefined) buttons = buttons[0]?.props?.children
						if (buttons === undefined) return component

						for (const idx in buttons) {
							const src = buttons[idx]?.props?.source
							if (
								((src === assets.call || src === assets.callNew) && s().dmHideCallButton) ||
								((src === assets.dmVideo || src === assets.dmVideoNew) && s().dmHideVideoButton)
							)
								delete buttons[idx]
						}

						return component
					}),
				)
			}),
		)
	})

	// --- Legacy DM header ---
	apply("ChannelButtons", () => {
		patches.push(
			getModules<any>(withProps("ChannelButtons"), mod => {
				patches.push(
					after(mod, "ChannelButtons", (component: any) => {
						if (!s().dmHideCallButton && !s().dmHideVideoButton) return component
						const assets = resolveAssets()

						const buttons = component?.props?.children
						if (buttons === undefined) return component

						for (const idx in buttons) {
							const src = buttons[idx]?.props?.children?.[0]?.props?.source
							if (src === undefined) continue
							if (
								(src === assets.call && s().dmHideCallButton) ||
								(src === assets.dmVideo && s().dmHideVideoButton)
							)
								delete buttons[idx]
						}

						return component
					}),
				)
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
