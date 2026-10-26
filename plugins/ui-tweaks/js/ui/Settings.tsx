import { useChangelog } from '../../../../shared/changelog'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import { update, useSettings } from '../lib/state'
import { SETTINGS_ROUTE, SHEET_ROUTE, SWIPE_ROUTE } from './routes'
import { SWIPE_ACTIONS } from '../lib/actions'
import type { SwipeAction } from '../defaults'

/** "Short: Reply · Further: React", or Discord's when both are untouched. */
function swipeLabel(short: SwipeAction, long: SwipeAction): string {
	if (short === 'stock' && long === 'stock') return "Discord's: reply, and edit your own messages on the further swipe."
	const name = (action: SwipeAction) => SWIPE_ACTIONS.find(a => a.value === action)?.label ?? action
	return `Short: ${name(short)} · Further: ${name(long)}`
}
import { ReactNavigationNative } from '@revenge-mod/externals/react-navigation'
import * as components from '@revenge-mod/components'
import { Design } from '@revenge-mod/discord/design'
import * as ReactNative from 'react-native'

function countHidden(...maps: Array<Record<string, true | null> | undefined>): number {
	return maps.reduce((sum, map) => sum + Object.values(map ?? {}).filter(value => value === true).length, 0)
}

function hiddenLabel(count: number): string {
	return count === 0 ? 'Nothing hidden' : count === 1 ? '1 thing hidden' : `${count} things hidden`
}

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	const { useNavigation } = ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = useSettings()

	const sheetHidden = countHidden(s.hiddenSheetRows, s.hiddenSheetGroups) + (s.hideSheetEmojiRow ? 1 : 0)
	const settingsHidden = countHidden(s.hiddenSettingsItems, s.hiddenSettingsSections)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Hide things" hasIcons>
						<TableRow
							label="Long-press menu"
							subLabel={hiddenLabel(sheetHidden)}
							icon={rowIcon('ChatIcon', 'CompassIcon')}
							arrow
							onPress={() => navigation.navigate(SHEET_ROUTE)}
						/>
						<TableRow
							label="Discord settings"
							subLabel={hiddenLabel(settingsHidden)}
							icon={rowIcon('SettingsIcon', 'CompassIcon')}
							arrow
							onPress={() => navigation.navigate(SETTINGS_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Emoji picker" hasIcons>
						<TableSwitchRow
							label="Hide the GIFs tab"
							icon={rowIcon('GifIcon', 'ImageIcon')}
							value={s.hidePickerGifs}
							onValueChange={(hidePickerGifs: boolean) => update({ hidePickerGifs })}
						/>
						<TableSwitchRow
							label="Hide the Stickers tab"
							icon={rowIcon('StickerIcon', 'StickerSmallIcon')}
							value={s.hidePickerStickers}
							onValueChange={(hidePickerStickers: boolean) => update({ hidePickerStickers })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Messages" hasIcons>
						<TableSwitchRow
							label="Hide the reaction bar"
							subLabel="Tapping a message no longer offers the quick emoji row."
							icon={rowIcon('ReactionIcon', 'CompassIcon')}
							value={s.hideReactionBar}
							onValueChange={(hideReactionBar: boolean) => update({ hideReactionBar })}
						/>
						<TableSwitchRow
							label="Double-tap to reply"
							subLabel="Reply on others' messages and edit your own, instead of the double-tap reaction. Takes effect after a restart."
							icon={rowIcon('ReplyIcon', 'PencilIcon')}
							value={s.doubleTapReply}
							onValueChange={(doubleTapReply: boolean) => update({ doubleTapReply })}
						/>
						<TableRow
							label="Swipe actions"
							subLabel={swipeLabel(s.swipeShort, s.swipeLong)}
							icon={rowIcon('ArrowsLeftRightIcon', 'ReplyIcon')}
							arrow
							onPress={() => navigation.navigate(SWIPE_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="DM list" hasIcons>
						<TableSwitchRow
							label="Hide Message Requests"
							subLabel="No Message Requests entry in the DM list."
							icon={rowIcon('InboxIcon', 'CompassIcon')}
							value={s.hideMessageRequests}
							onValueChange={(hideMessageRequests: boolean) => update({ hideMessageRequests })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
