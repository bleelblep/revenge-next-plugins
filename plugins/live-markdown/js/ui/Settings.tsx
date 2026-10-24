import { rowIcon } from './icon'
import { useBottomPadding } from './safeArea'
import { update, useSettings } from './state'
import { FORMATS } from '../native'
import { useChangelog } from '../../../../shared/changelog'
import * as components from '@revenge-mod/components'
import { Design } from '@revenge-mod/discord/design'
import * as ReactNative from 'react-native'

export default function Settings() {
	// The changelog icon at the top right, and "What's new" once after an update.
	useChangelog()
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } = Design as any

	const s = useSettings()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="How it works">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								In the message box, **bold**, *italics*, __underline__, ~~strikethrough~~, ||spoilers||, `code`,
								headings, -# subtext, &gt; quotes and [masked](https://links) show styled as you type. Only the
								look changes: the message you send is exactly what you typed.
							</Text>
						</View>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Fade the symbols"
							subLabel="Dims the ** ` ~~ and other markers so the styled text stands out."
							icon={rowIcon('EyeIcon')}
							value={s.dimMarkers}
							onValueChange={(dimMarkers: boolean) => update({ dimMarkers })}
						/>
						<TableSwitchRow
							label="Bigger headings"
							subLabel="# headings grow and -# subtext shrinks, like in chat. Off keeps every line the same size."
							icon={rowIcon('TextIcon')}
							value={s.headings}
							onValueChange={(headings: boolean) => update({ headings })}
						/>
						<TableSwitchRow
							label="Code font"
							subLabel="Shows `code` and code blocks in a fixed-width font."
							icon={rowIcon('CodeIcon', 'SlashBoxIcon')}
							value={s.monoCode}
							onValueChange={(monoCode: boolean) => update({ monoCode })}
						/>
					</TableRowGroup>

					<TableRowGroup
						title="Selection menu"
						description="Select text in the message box: these appear next to Copy and Paste (most under ⋮). Tap one again to undo it."
					>
						{FORMATS.map(format => (
							<TableSwitchRow
								key={format.id}
								label={format.label}
								subLabel={format.example}
								value={(s.menu ?? []).includes(format.id)}
								onValueChange={(on: boolean) => {
									const current = s.menu ?? []
									// Kept in menu order, whatever order they were switched on in.
									const menu = FORMATS.map(f => f.id).filter(id => (id === format.id ? on : current.includes(id)))
									update({ menu })
								}}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
