/**
 * The badge: pronouns as the native tag pill next to the author name in chat.
 *
 * Chat rows are native data, not React — the tag next to the author name is drawn from
 * `getTagProperties` (`modules/messages/native/renderer/getTagProperties.tsx`), which this
 * rewrites the same way staff-tags does (`plugins/staff-tags/js/patches/chat.ts`). Because the
 * native renderer only draws the author/tag row on the first message of a block, the badge comes
 * out once per author block for free.
 *
 * Resolved inside the exported function, not at module top level (porting rule 1), and found with
 * `getModules`, not `lookupModule`: on a cold start getTagProperties isn't loaded until the chat
 * screen first renders, and lookupModule would permanently cache that miss.
 */

import { shownFor } from '../lib/filter'
import { onUpdate, settings } from '../lib/state'
import { prime, resolve } from '../lib/resolve'
import { onResolved } from '../lib/pronounDB'
import { onProfileChange } from '../lib/discord'
import { redrawMessage } from '../lib/redraw'
import { badgeColor, tagColorProps } from '../lib/color'
import { Stores } from '@revenge-mod/discord/flux'
import * as finders from '@revenge-mod/modules/finders'
import * as filters from '@revenge-mod/modules/finders/filters'
import { after, before } from '@revenge-mod/patcher'
import { reportError } from '../../../../shared/report'

const TAG = '[Pronouns]'

// ---------------------------------------------------------------------------------------------
// What recent rows show, so a landed result redraws exactly the rows whose badge changes.
//
// Every async source (a profile fetch, a PronounDB batch, a settings change) ends in refresh(),
// which re-resolves each recent row and redraws the ones whose answer differs from what was
// drawn. That covers rows still waiting for a badge and rows whose badge is superseded (a guild
// profile's pronouns beating the user's own), and does nothing for rows that are already right.
// Only the latest rows matter -- they're what's on screen.

const MAX_RECENT_ROWS = 200

interface Row {
	authorId: string
	guildId?: string
	/** The badge text this row was last drawn with; undefined = no badge. */
	shown?: string
}

const recent = new Map<string, Row>()

function track(key: string, row: Row) {
	recent.delete(key)
	recent.set(key, row)
	if (recent.size > MAX_RECENT_ROWS) recent.delete(recent.keys().next().value as string)
}

/** The badge text a row of this author should show right now, or undefined for none. */
function badgeFor(authorId: string, guildId?: string): string | undefined {
	if (!settings().showInChat || !shownFor(authorId)) return undefined
	const text = resolve(authorId, guildId)?.text
	// The colour is part of what was drawn, so changing it redraws the row too.
	return text && `${text}\u0000${badgeColor(authorId, guildId) ?? ''}`
}

let refreshTimer: ReturnType<typeof setTimeout> | undefined

/** Redraws every recent row whose badge changed. Coalesced: stores emit in bursts. */
export function refresh() {
	if (refreshTimer !== undefined) return
	refreshTimer = setTimeout(() => {
		refreshTimer = undefined
		for (const [key, row] of [...recent]) {
			try {
				if (badgeFor(row.authorId, row.guildId) === row.shown) continue
				const at = key.indexOf(':')
				// The redraw re-runs getTagProperties, which records the new text in `shown`.
				if (at > 0) redrawMessage(key.slice(0, at), key.slice(at + 1))
			} catch (error) {
				reportError(`${TAG} refresh failed:`, error)
			}
		}
	}, 50)
}

// ---------------------------------------------------------------------------------------------
// The patch

export default (): () => void => {
	const { getModules } = finders
	const { withName } = filters
	const { ChannelStore } = Stores as any

	const unpatches: Array<() => void> = []

	// The message whose tag is being computed, handed from the `before` half to the `after` half.
	// getTagProperties is synchronous and never re-entered, so one slot is enough.
	let pendingMessage: any

	const unsubscribe = getModules(
		withName('getTagProperties'),
		(getTagProperties: any) => {
			// A throw here is not caught by Revenge when the module is already initialized: the
			// callback runs as a bare engine job, and an uncaught error there can close the app.
			// So everything below is guarded (docs/debugging/api-contracts.md).
			try {
				if (typeof getTagProperties?.default !== 'function') return

				// `before` + `after`, not `instead`: other plugins `instead`-hook this same
				// function (Clyde Utils does), and two `instead` hooks on one method can recurse
				// until the stack overflows. `before`/`after` compose with any number of them.
				// `after` only receives the return value, so the message is stashed in `before`.
				unpatches.push(
					before(getTagProperties, 'default', (args: any[]) => {
						pendingMessage = args?.[0]?.message
						// A before-hook must return the args array (porting rule 2).
						return args
					}),
				)

				unpatches.push(
					after(getTagProperties, 'default', (ret: any) => {
						const message = pendingMessage
						pendingMessage = undefined
						try {
							// A message that already carries a tag (bot, system, automod, or a
							// staff tag) keeps it: pronouns never override an existing tag.
							if (ret?.tagText || !message?.author?.id) return ret
							if (!settings().showInChat) {
								// Tracked anyway, so turning the badge back on redraws this row.
								track(`${message.channel_id}:${message.id}`, { authorId: String(message.author.id) })
								return ret
							}

							const channel = ChannelStore.getChannel(message.channel_id)
							const authorId = String(message.author.id)
							const guildId = channel?.guild_id ?? undefined
							const key = `${message.channel_id}:${message.id}`
							// Filtered out: no badge, and no profile or PronounDB lookup either.
							if (!shownFor(authorId)) {
								track(key, { authorId, guildId })
								return ret
							}
							prime(authorId, guildId)
							const text = resolve(authorId, guildId)?.text
							track(key, { authorId, guildId, shown: badgeFor(authorId, guildId) })
							return text ? { ...ret, tagText: text, tagType: undefined, ...tagColorProps(authorId, guildId) } : ret
						} catch (error) {
							reportError(`${TAG} chat tag failed:`, error)
							// The after-hook's return value is assigned unconditionally, so the
							// original result must survive a failure here.
							return ret
						}
					}),
				)
			} catch (error) {
				reportError(`${TAG} could not patch getTagProperties:`, error)
			}
		},
		{ returnNamespace: true },
	)

	const unsubDB = onResolved(() => refresh())
	const unsubProfile = onProfileChange(() => refresh())
	// Any settings change (mode, lists, overrides, order) can change a drawn badge.
	const unsubSettings = onUpdate(() => refresh())

	return () => {
		unsubDB()
		unsubProfile()
		unsubSettings()
		unsubscribe()
		for (const unpatch of unpatches.reverse()) unpatch()
		pendingMessage = undefined
		if (refreshTimer !== undefined) clearTimeout(refreshTimer)
		refreshTimer = undefined
		recent.clear()
	}
}
