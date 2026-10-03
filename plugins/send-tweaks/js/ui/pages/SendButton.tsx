import { getStorage, useSettings } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'

/**
 * What holding the send button does, and which parts of its sheet show. The button is memoised, so
 * a change reaches it the next time the chat bar redraws (switching chats does it).
 */
export default function SendButton() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } =
		revenge.discord.design.Design as any

	const storage = getStorage()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)
	const off = !s.sendButtonSheet
	const swipe = s.sendButtonMode === 'swipe'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Hold the send button"
							subLabel="Holding send does nothing in stock Discord. Switch on to use it for the options below."
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							value={!!s.sendButtonSheet}
							onValueChange={(value: boolean) => set({ sendButtonSheet: value })}
						/>
					</TableRowGroup>

					<TableRadioGroup
						title="When you hold it"
						defaultValue={s.sendButtonMode}
						onChange={(mode: SendTweaksStorage['sendButtonMode']) =>
							set({ sendButtonMode: mode })
						}
					>
						<TableRadioRow
							label="Open the menu"
							subLabel="Hold send and the menu below opens."
							value="sheet"
							disabled={off}
						/>
						<TableRadioRow
							label="Hold and swipe up"
							subLabel="Hold send and slide up. Let go halfway to preview it before sending; at the top to send it exactly as typed, with no link cleaning, rules or @silent. Let go lower to cancel. The menu is off in this mode."
							value="swipe"
							disabled={off}
						/>
					</TableRadioGroup>

					<TableRowGroup title={swipe ? 'Menu (off while hold and swipe is on)' : 'Menu'} hasIcons>
						<TableSwitchRow
							label="This message"
							subLabel="Send this one silently (or with notifications), or unchanged."
							icon={rowIcon('ChatIcon', 'ic_message')}
							disabled={off || swipe}
							value={!!s.sheetThisMessage}
							onValueChange={(value: boolean) => set({ sheetThisMessage: value })}
						/>
						<TableSwitchRow
							label="Quick switches"
							subLabel="Silent messages, link cleaning, rules and reply pings."
							icon={rowIcon('ListBulletsIcon')}
							disabled={off || swipe}
							value={!!s.sheetSwitches}
							onValueChange={(value: boolean) => set({ sheetSwitches: value })}
						/>
						<TableSwitchRow
							label="More settings"
							subLabel="A shortcut to these pages."
							icon={rowIcon('ArrowSmallRightIcon', 'ic_arrow_right')}
							disabled={off || swipe}
							value={!!s.sheetMoreSettings}
							onValueChange={(value: boolean) => set({ sheetMoreSettings: value })}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						{swipe ? '' : 'With every part of the menu off, holding send does nothing. '}
						Changes reach the send button the next time you open a chat.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
