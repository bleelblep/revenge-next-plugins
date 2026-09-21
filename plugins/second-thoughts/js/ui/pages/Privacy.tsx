import { aiStatus } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/**
 * What is sent, when, and what never is.
 *
 * Its own destination rather than a paragraph at the bottom of a settings page, because it is the
 * question a reasonable person asks before installing a plugin that reads everything they type,
 * and an answer buried under six toggles is not an answer.
 */
export default function Privacy() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design

	const status = aiStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Never leaves this device" hasIcons>
						<TableRow
							label="Anything the patterns catch"
							subLabel="Keys, tokens, card numbers, phone numbers, addresses. Matched locally by pattern. A credential is never uploaded to ask whether it is a credential."
							icon={rowIcon('LockIcon', 'ic_lock')}
						/>
						<TableRow
							label="Every message that passes"
							subLabel="Which is nearly all of them. A draft that does not trip the local gate is never read by anything but this device."
							icon={rowIcon('CircleCheckIcon', 'ic_check')}
						/>
						<TableRow
							label="Anything that reads as reaching out"
							subLabel="A draft about your own wellbeing is passed straight through, ahead of every other check, and is never sent anywhere or held for any reason."
							icon={rowIcon('HeartIcon', 'ic_heart')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Sent, when it happens" hasIcons>
						<TableRow
							label="One flagged draft, on its own"
							subLabel="Only the text you typed. No channel history, no usernames, no server name, nothing you did not write."
							icon={rowIcon('UploadIcon', 'ic_upload')}
						/>
						<TableRow
							label="Where it goes"
							subLabel={
								status === 'absent'
									? 'Nowhere. AI Core is not installed, so nothing can be sent at all.'
									: 'To whichever endpoint AI Core is pointed at. See AI Core > Provider.'
							}
							icon={rowIcon('LinkIcon', 'ic_link')}
						/>
					</TableRowGroup>

					<View>
						<Text color="text-muted" variant="text-sm/normal">
							Nothing is stored. The plugin keeps your settings and a snooze
							timestamp, and holds the draft it is asking you about only until
							you answer. There is no log of what was held, on this device or
							anywhere else — if you want to know what would happen to a
							message, use Try a draft rather than looking for a history that
							does not exist.
						</Text>
					</View>
				</Stack>
			</ScrollView>
		</Page>
	)
}
