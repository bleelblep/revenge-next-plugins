import { DEFAULTS } from '../../defaults'
import { getStorage, patch } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/** What a blurred message looks like, and what is left alone. */
export default function Appearance() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Blur images and embeds too"
							subLabel="In a blurred message, attachments and link previews are spoilered as well"
							icon={rowIcon('ImageIcon', 'ic_image')}
							value={!!s.blurMedia}
							onValueChange={value => patch({ blurMedia: value })}
						/>
						<TableSwitchRow
							label="Say why"
							subLabel="A small line under the blur, like “Blurred: mentions finale”"
							icon={rowIcon('CircleInformationIcon', 'ic_info')}
							value={!!s.showReason}
							onValueChange={value => patch({ showReason: value })}
						/>
						<TableSwitchRow
							label="Never blur my own messages"
							subLabel="Your own messages are always shown as written"
							icon={rowIcon('UserIcon', 'ic_profile_24px')}
							value={!!s.skipOwn}
							onValueChange={value => patch({ skipOwn: value })}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Blurring uses Discord's own spoiler, so a blurred message looks like any
						other spoiler and opens with a tap. Changes apply as messages are drawn
						again — reopen a channel to see them everywhere.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
