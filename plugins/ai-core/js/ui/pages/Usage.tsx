import { DEFAULTS } from '../../defaults'
import { listDependents } from '../../lib/dependents'
import {
	callsRemaining,
	getStorage,
	NO_CAP,
	resetUsage,
	today,
	usageByPlugin,
} from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { AiCoreStorage } from '../../types'

/** The cap, and where the day's calls went. */
export default function Usage() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TextInput,
		Slider,
		AlertModal,
		AlertActionButton,
	} = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)

	const fresh = s.usageDay !== today()
	const used = fresh ? 0 : s.usageCalls
	const spenders = fresh ? [] : usageByPlugin()
	const counts: Record<string, number> = fresh ? {} : (s.usageByPlugin ?? {})
	const users = listDependents().map(d => ({ ...d, calls: counts[d.id] ?? 0 }))

	const confirmReset = () => {
		const key = 'AiCoreResetUsage'
		Alerts.openAlert(
			key,
			<AlertModal
				title="Reset today's count?"
				content="The cap starts again from zero. This does not refund anything already spent with the provider."
				actions={
					<>
						<AlertActionButton
							text="Reset"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								resetUsage()
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title={`Daily cap — ${s.dailyCallCap} calls`}>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								A hard ceiling shared by every plugin that uses this one. At
								zero nothing can call out at all, which is the quickest way to
								switch the whole thing off without deleting your key.
							</Text>
							<Slider
								step={5}
								value={s.dailyCallCap}
								minimumValue={0}
								maximumValue={200}
								onValueChange={value =>
									set({ dailyCallCap: Math.round(value) })
								}
							/>
						</View>
					</TableRowGroup>

					<TableRowGroup title="Today" hasIcons>
						<TableRow
							label="Calls"
							subLabel={`${used} used, ${callsRemaining()} left`}
							icon={rowIcon('ChatIcon', 'ic_message')}
						/>
						<TableRow
							label="Tokens"
							subLabel={`${fresh ? 0 : s.usagePromptTokens} in, ${fresh ? 0 : s.usageCompletionTokens} out`}
							icon={rowIcon('TextIcon', 'ic_text')}
						/>
						<TableRow
							label="Reset the count"
							subLabel="Start the cap again from zero"
							icon={rowIcon('TrashIcon', 'ic_trash_24px')}
							arrow
							onPress={confirmReset}
						/>
					</TableRowGroup>

					{/*
					 * Per-plugin caps.
					 *
					 * Listed from `listDependents()`, not from usage, so a plugin can be given a cap
					 * before it has ever called out. The shared cap above always applies on top: a
					 * per-plugin number can only narrow it, never buy extra calls, or the shared one
					 * would stop meaning anything.
					 */}
					<TableRowGroup title="Per-plugin limits" hasIcons>
						<TableSwitchRow
							label="Limit each plugin separately"
							subLabel="Off means only the shared cap above applies, which is the simpler thing to reason about."
							icon={rowIcon('SpeedometerIcon', 'ic_analytics')}
							value={!!s.enforcePerPluginCaps}
							onValueChange={value => set({ enforcePerPluginCaps: value })}
						/>
					</TableRowGroup>

					{s.enforcePerPluginCaps ? (
						users.length ? (
							<TableRowGroup title="Calls per day, per plugin">
								<View
									style={{
										paddingHorizontal: 16,
										paddingVertical: 12,
										gap: 12,
									}}
								>
									<Text color="text-muted" variant="text-sm/normal">
										Blank means no limit of its own. Zero stops that plugin
										calling out entirely, which is the way to mute one without
										uninstalling it.
									</Text>
									{users.map(dependent => {
										const cap = s.perPluginCaps?.[dependent.id]
										const hasCap = typeof cap === 'number' && cap >= 0
										return (
											<TextInput
												key={dependent.id}
												label={dependent.name}
												placeholder="No limit"
												description={`${dependent.calls} call${dependent.calls === 1 ? '' : 's'} today`}
												value={hasCap ? `${cap}` : ''}
												isClearable
												onChange={value => {
													const digits = value.replace(/\D/g, '')
													// An explicit -1 rather than dropping the key: a merge cannot
													// delete one (porting rule 6), so absence has to be a value.
													const next =
														digits === '' ? NO_CAP : Number.parseInt(digits, 10)
													set({
														perPluginCaps: {
															...s.perPluginCaps,
															[dependent.id]: Number.isFinite(next)
																? next
																: NO_CAP,
														},
													})
												}}
											/>
										)
									})}
								</View>
							</TableRowGroup>
						) : (
							<TableRowGroup title="Calls per day, per plugin">
								<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
									<Text color="text-muted" variant="text-sm/normal">
										No plugin is using AI Core yet, so there is nothing to
										limit.
									</Text>
								</View>
							</TableRowGroup>
						)
					) : null}

					{spenders.length ? (
						<TableRowGroup title="Which plugin spent it">
							{spenders.map(([id, count]) => (
								<TableRow
									key={id}
									label={id}
									subLabel={`${count} call${count === 1 ? '' : 's'}`}
								/>
							))}
						</TableRowGroup>
					) : null}

					<TableRowGroup title="Queue">
						<View
							style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
						>
							<TextInput
								label="Requests at once"
								placeholder={`${DEFAULTS.concurrency}`}
								description="Requests above this wait their turn. Raising it makes a rate limit likelier, not answers faster."
								value={`${s.concurrency}`}
								onChange={value => {
									const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
									set({
										concurrency:
											Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
									})
								}}
							/>
						</View>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
