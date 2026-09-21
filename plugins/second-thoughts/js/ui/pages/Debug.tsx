import { DEFAULTS } from '../../defaults'
import { lastRestoreRoute } from '../../lib/draft'
import { aiStatus, getStorage } from '../../lib/state'
import { hookStatus } from '../../patches/sendMessage'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SecondThoughtsStorage } from '../../types'

/** Developer tools only. Anything that reports internals belongs here, not on a user page. */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<SecondThoughtsStorage>) => storage?.set(patch)

	const hook = hookStatus()
	const route = lastRestoreRoute()

	const aiLine = (() => {
		switch (aiStatus()) {
			case 'absent':
				return 'Not installed — judgement checks never run'
			case 'unconfigured':
				return 'Installed, no API key set'
			case 'exhausted':
				return "Installed and keyed, but today's cap is spent"
			default:
				return 'Installed, keyed, budget available'
		}
	})()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Prints gate scores, signals and verdicts to logcat under ReactNativeJS"
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => set({ debugLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Status" hasIcons>
						<TableRow
							label="Send hook"
							subLabel={
								hook.installed
									? `Guarding sendMessage on module ${hook.moduleId}`
									: 'Not installed — nothing is being checked'
							}
							icon={rowIcon('ShieldIcon', 'ic_shield')}
						/>
						<TableRow
							label="AI Core"
							subLabel={aiLine}
							icon={rowIcon('LinkIcon', 'ic_link')}
						/>
						<TableRow
							label="Draft restore"
							subLabel={
								route
									? `Last recovery used: ${route}`
									: 'Not exercised yet — hold a message and choose "Let me edit"'
							}
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Draft restore has three routes and falls back down the list:
						saveDraft, then a DRAFT_CHANGE dispatch, then the clipboard. The
						clipboard always works, so your words are never lost — but seeing
						"clipboard" here means the first two missed on this Discord build
						and are worth chasing.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
