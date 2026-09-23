import { DEFAULTS } from '../../defaults'
import { listDependents } from '../../lib/dependents'
import {
	callsRemaining,
	getStorage,
	NO_CAP,
	usageByPlugin,
} from '../../lib/state'
import { resetUsage, setCap, useVaultStatus } from '../../lib/vault'
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
		Card,
	} = revenge.discord.design.Design
	const React = revenge.react.React

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)

	// The count and the shared cap live in the native vault, not in jsonStorage, so no plugin
	// can reset them by rewriting a file.
	const vault = useVaultStatus()
	const used = vault.calls
	const spenders = usageByPlugin()
	const counts: Record<string, number> = vault.byPlugin ?? {}
	const users = listDependents().map(d => ({ ...d, calls: counts[d.id] ?? 0 }))

	// The slider tracks locally and commits on release: raising the cap asks for confirmation
	// natively, and one prompt per slider step would be unusable.
	const [draftCap, setDraftCap] = React.useState<number | null>(null)
	const shownCap = draftCap ?? vault.cap

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					{/*
					 * A slider is a custom control, so it lives in a Card rather than pretending
					 * to be a row (docs/plugin-design-language.md §3.2).
					 */}
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
							<Text color="text-default" variant="text-md/semibold">
								{`Daily cap — ${shownCap} call${shownCap === 1 ? '' : 's'}`}
							</Text>
							<Text color="text-muted" variant="text-sm/normal">
								A hard ceiling shared by every plugin that uses this one. At zero
								nothing can call out at all, which is the quickest way to switch
								the whole thing off without deleting your key. Raising it asks you
								to confirm in a system prompt, so no other plugin can raise it
								quietly.
							</Text>
							<Slider
								step={5}
								value={shownCap}
								minimumValue={0}
								maximumValue={200}
								onValueChange={value => setDraftCap(Math.round(value))}
								onSlidingComplete={async value => {
									await setCap(Math.round(value))
									// Snap back to what the vault actually accepted.
									setDraftCap(null)
								}}
							/>
						</View>
					</Card>

					<TableRowGroup title="Today" hasIcons>
						<TableRow
							label="Calls"
							subLabel={`${used} used, ${callsRemaining()} left`}
							icon={rowIcon('ChatIcon', 'ic_message')}
						/>
						<TableRow
							label="Tokens"
							subLabel={`${vault.promptTokens} in, ${vault.completionTokens} out`}
							icon={rowIcon('TextIcon', 'ic_text')}
						/>
						<TableRow
							label="Reset the count"
							subLabel={
								vault.usageTampered
									? "The usage record was altered or deleted, so nothing can call out until you reset it"
									: 'Start the cap again from zero. Confirmed in a system prompt.'
							}
							icon={rowIcon('TrashIcon', 'ic_trash_24px')}
							arrow
							onPress={() => resetUsage()}
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
							<>
								<Text color="text-muted" variant="text-sm/normal">
									Blank means no limit of its own. Zero stops that plugin calling
									out entirely, which is the way to mute one without uninstalling
									it.
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
											trailingText="a day"
											returnKeyType="done"
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
														[dependent.id]: Number.isFinite(next) ? next : NO_CAP,
													},
												})
											}}
										/>
									)
								})}
							</>
						) : (
							<Text color="text-muted" variant="text-sm/normal">
								No plugin is using AI Core yet, so there is nothing to limit.
							</Text>
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

					<TextInput
						label="Requests at once"
						placeholder={`${DEFAULTS.concurrency}`}
						description="Requests above this wait their turn. Raising it makes a rate limit likelier, not answers faster."
						value={`${s.concurrency}`}
						returnKeyType="done"
						onChange={value => {
							const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
							set({
								concurrency: Number.isFinite(parsed) && parsed >= 1 ? parsed : 1,
							})
						}}
					/>
				</Stack>
			</ScrollView>
		</Page>
	)
}
