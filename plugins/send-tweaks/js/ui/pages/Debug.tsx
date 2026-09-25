import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { outgoingStatus } from '../../patches/outgoing'
import { replyStatus } from '../../patches/replyMention'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'

/** Developer tools only. Reports outcomes, never intentions -- porting rule 3. */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)

	const out = outgoingStatus()
	const reply = replyStatus()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Prints what each send had removed or replaced to logcat under ReactNativeJS. Counts only, never message text."
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => set({ debugLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Hooks" hasIcons>
						<TableRow
							label="Sending and editing"
							subLabel={
								out.installed
									? `Hooked on module ${out.moduleId}`
									: 'Not hooked yet — send a message, then look again'
							}
							icon={rowIcon('SendMessageIcon', 'ic_send')}
						/>
						<TableRow
							label="Reply mentions"
							subLabel={
								reply.installed
									? 'Hooked'
									: 'Not hooked yet — start a reply, then look again'
							}
							icon={rowIcon('ArrowAngleLeftUpIcon')}
						/>
					</TableRowGroup>

					<TableRowGroup title="This session" hasIcons>
						<TableRow
							label="Messages changed"
							subLabel={`${out.sends} sent, ${out.edits} edited, ${out.drafts} edit box${out.drafts === 1 ? '' : 'es'} opened cleaned`}
							icon={rowIcon('ChatIcon', 'ic_message')}
						/>
						<TableRow
							label="Tracking removed"
							subLabel={`${out.cleaned} parameter${out.cleaned === 1 ? '' : 's'}`}
							icon={rowIcon('LinkIcon', 'ic_link')}
						/>
						<TableRow
							label="Links rewritten"
							subLabel={`${out.rewritten} link${out.rewritten === 1 ? '' : 's'}`}
							icon={rowIcon('LinkIcon', 'ic_link')}
						/>
						<TableRow
							label="Rules applied"
							subLabel={`${out.replaced} time${out.replaced === 1 ? '' : 's'}`}
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
						/>
						<TableRow
							label="Replies started without a ping"
							subLabel={`${reply.silenced}`}
							icon={rowIcon('BellSlashIcon')}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
