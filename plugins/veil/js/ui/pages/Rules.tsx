import { DEFAULTS } from '../../defaults'
import { repaintChannel } from '../../lib/repaint'
import { channelName, getStorage, toggleId, userName } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/** Rules are made from a message's long-press menu; here they are listed and removed. */
export default function Rules() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const channels: string[] = s.channelIds ?? []
	const people: string[] = s.userIds ?? []

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Long-press any message to blur everything from that person or in that
						channel. Both are checked on this device and cost nothing.
					</Text>

					{people.length ? (
						<TableRowGroup title="People — tap one to stop blurring them" hasIcons>
							{people.map(id => (
								<TableRow
									key={id}
									label={userName(id)}
									icon={rowIcon('UserIcon', 'ic_profile_24px')}
									onPress={() => toggleId('userIds', id, false)}
								/>
							))}
						</TableRowGroup>
					) : null}

					{channels.length ? (
						<TableRowGroup title="Channels — tap one to stop blurring it" hasIcons>
							{channels.map(id => (
								<TableRow
									key={id}
									label={channelName(id)}
									icon={rowIcon('TextIcon', 'ic_text')}
									onPress={() => {
										toggleId('channelIds', id, false)
										repaintChannel(id)
									}}
								/>
							))}
						</TableRowGroup>
					) : null}

					{!people.length && !channels.length ? (
						<Text color="text-muted" variant="text-sm/normal">
							Nothing here yet.
						</Text>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
