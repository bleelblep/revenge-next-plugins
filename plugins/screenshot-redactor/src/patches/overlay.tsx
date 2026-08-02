import { noteOverlayHost } from "../lib/diagnostics"
import { settings } from "../lib/state"
import RedactToggle from "../ui/components/RedactToggle"

/**
 * Mounts the floating toggle over the chat.
 *
 * There is no portal or overlay API exposed to plugins — `revenge.components` is four settings
 * widgets, and nothing in the generated types offers a root mount point. So the button has to
 * ride along with a component that is already on screen whenever a channel is.
 *
 * Deliberately *not* `JumpToPresentButton`, which is the obvious host and is what Jump To Top
 * patches: that button only renders while you're scrolled up, so the toggle would vanish
 * exactly when you're at the bottom of a conversation about to screenshot it.
 *
 * `after` rather than `instead`: the hook only needs the returned element, not the arguments,
 * and this keeps the plugin's "no `instead`" record intact (porting rule 2). The toggle is
 * appended as a Fragment sibling and positioned absolutely, so it takes part in no layout and
 * cannot reflow the host.
 *
 * WHICH host actually exists is unverified. All candidates are watched and whichever matches
 * first claims the mount; Diagnostics in settings reports which one took, or that none did.
 */
const HOST_CANDIDATES = [
	"ChatInput",
	"ChannelChatInput",
	"ChatInputGuardWrapper",
	"MessagesWrapperConnected",
	"MessagesWrapper",
	"ChatView",
]

export default function patchOverlay(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters

	const cleanups: Array<() => void> = []
	const unsubscribes: Array<() => void> = []
	let mounted = false

	for (const name of HOST_CANDIDATES) {
		unsubscribes.push(
			getModules(
				withName(name),
				(mod: any) => {
					// One host only: two would put two buttons on screen, and they would fight
					// over the hide timer.
					if (mounted) return
					if (typeof mod?.default !== "function") return

					try {
						cleanups.push(
							revenge.patcher.after(mod, "default", (el: any) => {
								// Runs on a render path -- return the element on every path.
								try {
									if (el == null) return el
									if (!settings().showOverlayToggle) return el

									const { React } = revenge.react
									return React.createElement(
										React.Fragment,
										null,
										el,
										React.createElement(RedactToggle, null),
									)
								} catch (error) {
									console.error("[ScreenshotRedactor] overlay render failed:", error)
									return el
								}
							}),
						)

						mounted = true
						noteOverlayHost(name)
					} catch (error) {
						console.error(`[ScreenshotRedactor] failed to mount overlay on ${name}:`, error)
					}
				},
				{ returnNamespace: true },
			),
		)
	}

	return () => {
		unsubscribes.forEach(unsubscribe => {
			try {
				unsubscribe()
			} catch {
				/* already gone */
			}
		})
		cleanups.forEach(unpatch => {
			try {
				unpatch()
			} catch {
				/* already gone */
			}
		})
	}
}
