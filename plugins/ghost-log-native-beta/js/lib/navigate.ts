const log = (...m: any[]) => console.log('[GhostLogNativeBeta]', ...m)

/**
 * `getModules(withProps(prop), cb)`, not `lookupModule`: confirmed pattern from
 * `hide-servers-drawer/src/ui/components/GuildRow.tsx` and `UnreadDmRow.tsx`, both shipped and
 * used constantly. `lookupModule` is a one-shot scan (porting-rules.md rule 3) that can miss a
 * module not yet initialized at call time; `getModules` subscribes and back-fills once it loads.
 * Safe at module scope for `withProps`-based filters -- see porting-rules.md rule 1's exception.
 */
let routing: any
revenge.modules.finders.getModules(revenge.modules.finders.filters.withProps('transitionToGuild'), (mod: any) => {
	routing = mod
})

let channelActions: any
revenge.modules.finders.getModules(revenge.modules.finders.filters.withProps('selectPrivateChannel'), (mod: any) => {
	channelActions = mod
})

let messageActions: any
revenge.modules.finders.getModules(revenge.modules.finders.filters.withProps('jumpToMessage'), (mod: any) => {
	messageActions = mod
})

/**
 * `openUrl` (tried first) resolves and calls cleanly but does nothing visible on-device
 * (2026-08-04) -- most likely because it hands the `https://discord.com/...` URL to Android's
 * Intent system, and this repackaged APK isn't registered as that domain's App Links handler, so
 * there's no in-app route back to it. `transitionTo` is a pure in-app router push (same module as
 * the confirmed-working `transitionToGuild`), so it never leaves the JS side.
 *
 * Falls back to transitionToGuild/selectPrivateChannel + jumpToMessage if `transitionTo` isn't
 * present on this build, since those two are independently confirmed shipped elsewhere in this
 * repo. Logs which path actually ran, not just that a function was called -- porting-rules.md
 * rule 5's "log the outcome, not the attempt."
 */
export function jumpToDeletedMessage(entry: { guildId?: string; channelId: string; id: string }): void {
	const path = `/channels/${entry.guildId ?? '@me'}/${entry.channelId}/${entry.id}`

	if (typeof routing?.transitionTo === 'function') {
		try {
			routing.transitionTo(path)
			log(`jumpToDeletedMessage: transitionTo(${path})`)
			return
		} catch (error) {
			console.error(`[GhostLogNativeBeta] transitionTo(${path}) failed:`, error)
		}
	}

	try {
		if (entry.guildId) routing?.transitionToGuild?.(entry.guildId)
		else channelActions?.selectPrivateChannel?.(entry.channelId)
	} catch (error) {
		console.error('[GhostLogNativeBeta] guild/channel select failed:', error)
	}

	try {
		messageActions?.jumpToMessage?.({ channelId: entry.channelId, messageId: entry.id, flash: true, jumpType: 'ANIMATED' })
		log(`jumpToDeletedMessage: fallback transitionToGuild/selectPrivateChannel + jumpToMessage for ${path}`)
	} catch (error) {
		console.error('[GhostLogNativeBeta] jumpToMessage failed:', error)
	}
}
