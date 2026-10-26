import { FieldGroup } from '../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../shared/ui/icon'
import { useBottomPadding } from '../../../../shared/ui/safeArea'
import type { SwipeAction } from '../defaults'
import { SWIPE_ACTIONS } from '../lib/actions'
import { requireReload, update, useSettings } from '../lib/state'
import * as components from '@revenge-mod/components'
import { Design } from '@revenge-mod/discord/design'
import * as ReactNative from 'react-native'

/** Swipe actions: what the short and the further swipe on a message do (patches/swipe.ts). */
export default function SwipePage() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow, TextInput } = Design as any
	const s = useSettings()

	const stage = (title: string, description: string, value: SwipeAction, set: (action: SwipeAction) => void) => (
		<TableRadioGroup title={title} description={description} value={value} onChange={(next: SwipeAction) => set(next)}>
			{SWIPE_ACTIONS.map(action => (
				<TableRadioRow key={action.value} label={action.label} subLabel={action.subLabel} value={action.value} />
			))}
		</TableRadioGroup>
	)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Every message" hasIcons>
						<TableSwitchRow
							label="Further swipe on every message"
							subLabel="Discord only gives your own messages a second swipe. Others' get one too. Takes effect after a restart."
							icon={rowIcon('ArrowsLeftRightIcon', 'ReplyIcon')}
							value={s.swipeAllMessages}
							onValueChange={(swipeAllMessages: boolean) => {
								update({ swipeAllMessages })
								requireReload()
							}}
						/>
					</TableRowGroup>

					{/* The icons are cached per built row, so a change asks for Revenge's reload. */}
					{stage('Short swipe', 'Swipe a message to the left.', s.swipeShort, swipeShort => {
						update({ swipeShort })
						requireReload()
					})}
					{stage(
						'Further swipe',
						'Keep swiping past the first icon. Each swipe shows the icon of what it does.',
						s.swipeLong,
						swipeLong => {
							update({ swipeLong })
							requireReload()
						},
					)}

					<FieldGroup
						title="React"
						label="Emoji"
						description="For the React action. Leave empty to use your Discord double-tap emoji."
					>
						<TextInput
							defaultValue={s.swipeEmoji}
							placeholder="👍"
							maxLength={16}
							onChange={(text: string) => update({ swipeEmoji: text.trim() })}
						/>
					</FieldGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
