import { noteNamePatch } from "../lib/diagnostics"
import { getStorage } from "../lib/state"

/**
 * The group-DM header, which redacted correctly but only after a screen change.
 *
 * Found on device (Discord 348.1, 2026-09-27) by hooking React's `jsx` and recording who created
 * the text holding the recipients' names:
 *
 * ```
 * PrivateChannelHeader            React.memo, re-renders only when its props change
 *   renderChannelTitle(title, { accessibleTitle, subtitle, disableArrow, userId, guildId })
 *     <ChannelTitle title="Alice, Bob, Carol" … />
 * ```
 *
 * `title` is `computeChannelName(channel, UserStore, RelationshipStore)` for an unnamed group, and
 * that function *does* go through the hooked resolvers: called directly it returns
 * `████, ████, ████`. What it lacks is a reason to run again. `PrivateChannelHeader` is memoized and
 * subscribes to nothing `lib/nudge.ts` emits on, so flipping redaction leaves the old string on
 * screen until the header is rebuilt by navigating away and back.
 *
 * ## The fix: our own component around theirs
 *
 * `renderChannelTitle` is a module export (module 12848, beside `renderGroupDMIcon`), and it is
 * called through the exports object, so an `after` hook sees every header title as it is made. For
 * a group DM (`userId` and `guildId` both empty) the returned element is wrapped in `GroupDmTitle`,
 * which subscribes to this plugin's settings with `storage.use()` and recomputes the name each time
 * they change. Only our component re-renders; Discord's memoized header is never touched.
 *
 * Not done instead: calling a hook from inside the `renderChannelTitle` hook. That would run inside
 * *Discord's* component, and `GuildChannelHeader` calls the same function -- if any caller ever
 * calls it conditionally, React sees a different hook count between renders and throws.
 *
 * A group with a name of its own (`channel.name`) is left alone: that name is not a person's.
 */

let channelNames: any
let selectedChannel: any

/** Module 4989 on 348.1: `computeChannelName` and the `computeDefaultGroupDmName` family. */
function channelNameModule(): any {
	if (channelNames) return channelNames
	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const [mod] = lookupModule(withProps("computeChannelName")) as [any, number | undefined]
		const host = typeof mod?.computeChannelName === "function" ? mod : mod?.default
		if (typeof host?.computeChannelName === "function") channelNames = host
	} catch {
		/* not loaded yet; the next header asks again */
	}
	return channelNames
}

function GroupDmTitle({ element, channelId, title }: { element: any; channelId: string; title: string }) {
	// The subscription: any settings change (the toggle, the style) re-renders this component alone.
	getStorage()?.use()

	try {
		const { ChannelStore, UserStore, RelationshipStore } = revenge.discord.flux.Stores as any
		const channel = ChannelStore?.getChannel?.(channelId)
		const names = channelNameModule()
		if (!channel || channel.type !== 3 || channel.name || !names) return element

		const fresh = names.computeChannelName(channel, UserStore, RelationshipStore)
		if (typeof fresh !== "string" || fresh === element?.props?.title) return element

		const accessible = element?.props?.accessibleTitle
		return revenge.react.React.cloneElement(element, {
			title: fresh,
			accessibleTitle: typeof accessible === "string" ? accessible.split(title).join(fresh) : fresh,
		})
	} catch {
		return element
	}
}

export default function patchGroupDmTitle(): () => void {
	const cleanups: Array<() => void> = []
	let pending: { title: unknown; options: any } | undefined
	const seen = new Set<any>()

	const install = (mod: any) => {
		const host = typeof mod?.renderChannelTitle === "function" ? mod : mod?.default
		if (typeof host?.renderChannelTitle !== "function" || seen.has(host.renderChannelTitle)) return
		seen.add(host.renderChannelTitle)

		cleanups.push(
			revenge.patcher.before(host, "renderChannelTitle", (args: any[]) => {
				pending = { title: args?.[0], options: args?.[1] }
				// Must return the args array -- see docs/porting-rules.md rule 2.
				return args
			}),
		)
		cleanups.push(
			revenge.patcher.after(host, "renderChannelTitle", (ret: any) => {
				const call = pending
				pending = undefined
				try {
					const options = call?.options
					// A single DM carries `userId`, a server channel `guildId`; a group DM neither.
					if (!ret || typeof call?.title !== "string" || options?.userId || options?.guildId) return ret

					if (!selectedChannel) selectedChannel = (revenge.discord.flux.Stores as any).SelectedChannelStore
					const channelId = selectedChannel?.getChannelId?.()
					if (typeof channelId !== "string") return ret

					return revenge.react.React.createElement(GroupDmTitle, {
						key: ret.key ?? undefined,
						element: ret,
						channelId,
						title: call.title,
					})
				} catch (error) {
					console.error("[ScreenshotRedactor] group DM title hook failed:", error)
					return ret
				}
			}),
		)
		// Recorded after patching: the slot now holds the patcher's proxy (see displayName.ts).
		seen.add(host.renderChannelTitle)

		console.log("[ScreenshotRedactor] hooked renderChannelTitle for group DM headers")
		noteNamePatch("renderChannelTitle (group DM header)")
	}

	try {
		const { lookupModules, waitForModules } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		// Paired with `renderGroupDMIcon` so an unrelated `renderChannelTitle` cannot match.
		const filter = () => withProps("renderChannelTitle", "renderGroupDMIcon")
		for (const [exports] of lookupModules(filter())) install(exports)
		cleanups.push(waitForModules(filter(), (exports: any) => install(exports)))
	} catch (error) {
		console.error("[ScreenshotRedactor] could not look for renderChannelTitle:", error)
	}

	return () => {
		for (const cleanup of cleanups.reverse()) {
			try {
				cleanup()
			} catch {
				/* already gone */
			}
		}
		channelNames = undefined
		selectedChannel = undefined
	}
}
