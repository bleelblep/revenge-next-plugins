/**
 * Putting the text back in the box.
 *
 * Holding a send is the easy half. The chat input clears itself in its own submit handler, which
 * runs before `sendMessage` is ever called, so by the time this plugin decides to hold a message
 * the user's text is already gone from the screen. Nothing recovers it but us.
 *
 * Three routes are tried in order and the one that answered is logged, because "the draft came
 * back" and "the draft came back from the fallback" are very different states to be in and the
 * settings page should be able to say which. Porting rule 3: log the outcome, not the attempt.
 *
 * The last route always works, so the user's words are never lost -- worst case they are on the
 * clipboard rather than in the box.
 */

import { debug, TAG, toast } from './state'

export type RestoreRoute = 'saveDraft' | 'dispatch' | 'clipboard' | 'none'

/**
 * The route that answered last, for the Debug page. Porting rule 3: report the outcome, not
 * the attempt -- a settings page that says "patched" while nothing is patched is how this
 * repository lost six releases once.
 */
let lastRoute: RestoreRoute | undefined

export function lastRestoreRoute(): RestoreRoute | undefined {
	return lastRoute
}

/** Discord's DraftType.ChannelMessage. */
const CHANNEL_MESSAGE = 0

let draftModule: any
let draftModuleResolved = false

/**
 * Resolved lazily and cached. Never at module scope -- `lookupModule` at preInit is how this
 * repo poisoned the Design proxy for a whole session (porting rule 1).
 */
function getDraftModule(): any {
	if (draftModuleResolved) return draftModule
	draftModuleResolved = true

	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const [mod, id] = lookupModule(withProps('saveDraft', 'clearDraft')) as [
			any,
			number | undefined,
		]
		if (id === undefined) {
			debug('no saveDraft module found')
			return undefined
		}
		// The export is usually on `default`, not on the namespace -- porting rule 3.
		const host = typeof mod?.saveDraft === 'function' ? mod : mod?.default
		draftModule = typeof host?.saveDraft === 'function' ? host : undefined
		debug(
			draftModule
				? `saveDraft resolved from module ${id}`
				: `module ${id} had no callable saveDraft`,
		)
	} catch (error) {
		debug('saveDraft lookup threw:', error)
	}

	return draftModule
}

function viaSaveDraft(channelId: string, content: string): boolean {
	const mod = getDraftModule()
	if (!mod) return false
	try {
		mod.saveDraft(channelId, CHANNEL_MESSAGE, content)
		return true
	} catch (error) {
		debug('saveDraft threw:', error)
		return false
	}
}

function viaDispatch(channelId: string, content: string): boolean {
	try {
		const dispatcher = revenge.discord.common.flux.Dispatcher as any
		if (typeof dispatcher?.dispatch !== 'function') return false
		dispatcher.dispatch({
			type: 'DRAFT_CHANGE',
			channelId,
			draftType: CHANNEL_MESSAGE,
			draft: content,
		})
		return true
	} catch (error) {
		debug('DRAFT_CHANGE dispatch threw:', error)
		return false
	}
}

function viaClipboard(content: string): boolean {
	try {
		const Clipboard = (revenge.react.ReactNative as any)?.Clipboard
		if (typeof Clipboard?.setString !== 'function') return false
		Clipboard.setString(content)
		return true
	} catch (error) {
		debug('clipboard write threw:', error)
		return false
	}
}

/** The route that worked is returned so the caller can tell the user where their text went. */
export function restoreDraft(channelId: string, content: string): RestoreRoute {
	lastRoute = restore(channelId, content)
	return lastRoute
}

function restore(channelId: string, content: string): RestoreRoute {
	if (viaSaveDraft(channelId, content)) {
		debug('draft restored via saveDraft')
		return 'saveDraft'
	}

	if (viaDispatch(channelId, content)) {
		debug('draft restored via DRAFT_CHANGE')
		return 'dispatch'
	}

	if (viaClipboard(content)) {
		console.log(
			`${TAG} could not reach the input box; draft copied to the clipboard instead`,
		)
		toast('Copied your message to the clipboard')
		return 'clipboard'
	}

	console.error(`${TAG} could not restore the draft by any route`)
	toast('Could not recover your message')
	return 'none'
}
