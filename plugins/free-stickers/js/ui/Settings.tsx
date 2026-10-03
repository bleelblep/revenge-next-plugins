import { rowIcon } from './icon'
import { useBottomPadding } from './safeArea'
import { update, useSettings } from '../lib/state'
import { useChangelog } from '../../../../shared/changelog'

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } = revenge.discord.design.Design as any
	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Sending" hasIcons>
						<TableSwitchRow
							label="Send every sticker as a link"
							subLabel="Even ones Discord would send as a real sticker, such as with Nitro or in their own server."
							icon={rowIcon('StickerIcon', 'LinkIcon')}
							value={s.forceLinks}
							onValueChange={(forceLinks: boolean) => update({ forceLinks })}
						/>
					</TableRowGroup>

					<TableRadioGroup
						title="Link size"
						defaultValue={`${s.size}`}
						onChange={(value: string) => update({ size: value === '320' ? 320 : 160 })}
					>
						<TableRadioRow label="Normal" subLabel="160 pixels, the size of a real sticker" value="160" />
						<TableRadioRow label="Large" subLabel="320 pixels" value="320" />
					</TableRadioGroup>

					<Text variant="text-sm/normal" color="text-muted">
						Stickers you can't send are sent as a link to the sticker's image, which Discord shows as the picture.
						GIF stickers stay animated; other animated ones arrive as a still. Discord's own animated stickers
						(Lottie) can't be sent this way. In channels where you can't embed links, the link shows as text.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
