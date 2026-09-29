import { type OneOff, sendOnce as sendNext } from '../../lib/nextSend'
import { getStorage, TAG, useSettings } from '../../lib/state'
import { rowIcon } from '../icon'
import type { SendTweaksStorage } from '../../types'

export const SHEET_KEY = 'SendTweaksSendSheet'

/** Whether the sheet would show anything, so an empty one is never opened. */
export function sheetHasContent(s: SendTweaksStorage, canSend: boolean): boolean {
	return (canSend && s.sheetThisMessage) || s.sheetSwitches || s.sheetMoreSettings
}

/** Revenge registers a plugin's own settings page (its `SettingsComponent`) under the plugin id. */
const MAIN_ROUTE = 'bleelblep.send-tweaks'

/**
 * Opens Send Tweaks' main settings page from anywhere, such as the chat.
 *
 * Settings is a `settings` stack on Discord's root navigator, and pages registered with
 * `registerSettingsItem` are routes inside it named by their key. So the root navigator is asked
 * for `settings` with our page as the nested screen. `openUserSettings(key)` looked like the
 * obvious call, but it ignores the key and always lands on the settings overview (checked live on
 * 348), so it is only the fallback: better settings than nothing.
 */
function openSettingsPage(): boolean {
	const { lookupModule } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters
	try {
		const host = lookupModule<any>(withProps('getRootNavigationRef'))?.[0]
		const ref = (host?.getRootNavigationRef ?? host?.default?.getRootNavigationRef)?.()
		if (ref?.isReady?.() !== false && typeof ref?.navigate === 'function') {
			ref.navigate('settings', { screen: MAIN_ROUTE })
			return true
		}
	} catch (error) {
		console.error(`${TAG} could not open the settings page:`, error)
	}
	try {
		const host = lookupModule<any>(withProps('openUserSettings'))?.[0]
		const open = host?.openUserSettings ?? host?.default?.openUserSettings
		if (typeof open !== 'function') return false
		open()
		return true
	} catch (error) {
		console.error(`${TAG} could not open settings:`, error)
		return false
	}
}

/**
 * The send button's long-press sheet: this message's one-off sends first, then the switches.
 *
 * `send` is the button's own `onPress`, captured when the sheet opened. A one-off send records what
 * to do (`lib/nextSend.ts`) and then presses it, so the message leaves through Discord's normal path.
 */
export default function SendSheet({ send }: { send?: () => void }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { ActionSheet, BottomSheetTitleHeader, Stack, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design as any
	const { hideActionSheet } = revenge.discord.actions.ActionSheetActionCreators

	const storage = getStorage()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)

	const sendOnce = (kind: OneOff) => {
		hideActionSheet(SHEET_KEY)
		sendNext(kind, send)
	}

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Send Tweaks" />
			<Stack spacing={16}>
				{typeof send === 'function' && s.sheetThisMessage ? (
					<TableRowGroup title="This message" hasIcons>
						{s.silentMessages ? (
							<TableRow
								label="Send with notifications"
								subLabel="Just this one. Silent messages stays on."
								icon={rowIcon('BellIcon')}
								onPress={() => sendOnce('loud')}
							/>
						) : (
							<TableRow
								label="Send silently"
								subLabel="Just this one: it arrives without notifying anyone."
								icon={rowIcon('BellSlashIcon', 'BellZIcon')}
								onPress={() => sendOnce('silent')}
							/>
						)}
						<TableRow
							label="Send unchanged"
							subLabel="Exactly as typed: no link cleaning, no rules, no @silent."
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							onPress={() => sendOnce('raw')}
						/>
					</TableRowGroup>
				) : null}

				{s.sheetSwitches ? (
				<TableRowGroup title="Settings" hasIcons>
					<TableSwitchRow
						label="Silent messages"
						icon={rowIcon('BellSlashIcon', 'BellZIcon')}
						value={!!s.silentMessages}
						onValueChange={(value: boolean) => set({ silentMessages: value })}
					/>
					<TableSwitchRow
						label="Remove tracking from links"
						icon={rowIcon('ShieldIcon', 'LinkIcon')}
						value={!!s.cleanUrls}
						onValueChange={(value: boolean) => set({ cleanUrls: value })}
					/>
					<TableSwitchRow
						label="Rewrite links"
						icon={rowIcon('LinkIcon', 'ic_link')}
						value={!!s.linkRewrite}
						onValueChange={(value: boolean) => set({ linkRewrite: value })}
					/>
					<TableSwitchRow
						label="Replace text as you send"
						icon={rowIcon('TextIcon', 'ic_edit_24px')}
						value={!!s.textReplace}
						onValueChange={(value: boolean) => set({ textReplace: value })}
					/>
					<TableSwitchRow
						label="Don't ping when replying"
						icon={rowIcon('ArrowAngleLeftUpIcon')}
						value={!!s.noReplyMention}
						onValueChange={(value: boolean) => set({ noReplyMention: value })}
					/>
				</TableRowGroup>
				) : null}

				{s.sheetMoreSettings ? (
				<TableRowGroup hasIcons>
					<TableRow
						label="More settings"
						subLabel="Rules, editing, and this menu"
						icon={rowIcon('SettingsIcon', 'ic_settings')}
						arrow
						onPress={() => {
							hideActionSheet(SHEET_KEY)
							if (!openSettingsPage()) {
								revenge.discord.actions.ToastActionCreators.open({
									key: 'SendTweaksSheetToast',
									content: 'Open Send Tweaks from Revenge’s plugin settings.',
								})
							}
						}}
					/>
				</TableRowGroup>
				) : null}
			</Stack>
		</ActionSheet>
	)
}
