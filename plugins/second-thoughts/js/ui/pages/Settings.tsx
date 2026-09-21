import { DEFAULTS } from '../../defaults'
import { aiStatus } from '../../lib/state'
import { rowIcon } from '../icon'
import { CHECKS_ROUTE, DEBUG_ROUTE, PRIVACY_ROUTE, TRY_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { SecondThoughtsStorage } from '../../types'

/**
 * The root index.
 *
 * A neutral notice card rather than a warning one: nothing here is risky, but the split between
 * the free half and the optional half is the single thing a user has to understand, and getting
 * it wrong in either direction is bad. Someone who thinks it needs an AI key will not install it;
 * someone who thinks everything is local will not realise a flagged draft is sent anywhere.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<SecondThoughtsStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<SecondThoughtsStorage>) =>
		api.jsonStorage.set(patch)

	const status = aiStatus()
	const snoozedFor = Math.max(
		0,
		Math.round((s.snoozedUntil - Date.now()) / 60000),
	)

	const patternsOn = [
		s.checkCredentials && 'credentials',
		s.checkPersonalDetails && 'personal details',
	]
		.filter(Boolean)
		.join(', ')

	const judgementOn = [
		s.checkHostile && 'hostile',
		s.checkDrunk && 'drunk',
		s.checkOversharing && 'oversharing',
	]
		.filter(Boolean)
		.join(', ')

	const judgementSummary = (() => {
		if (status === 'absent') return 'install AI Core to use'
		if (status === 'unconfigured') return 'AI Core has no key set'
		if (status === 'exhausted') return "AI Core's cap is spent"
		return judgementOn || 'none on'
	})()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Patterns are free. Judgement is optional.
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Credentials, keys and card numbers are matched on this device,
								on every send, with nothing installed and nothing sent anywhere.
								Anger, drunk-posting and oversharing cannot be matched that way,
								so they need AI Core — and even then a draft only leaves once a
								free local check has already flagged it.
							</Text>
						</View>
					</Card>

					<Text color="text-muted" variant="text-sm/normal">
						Nothing is ever held silently. Every hold asks first, and doing
						nothing sends nothing.
					</Text>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Enabled"
							subLabel="Turn the whole guard off without losing your settings"
							icon={rowIcon('ShieldIcon', 'ic_shield')}
							value={!!s.enabled}
							onValueChange={value => set({ enabled: value })}
						/>
						{snoozedFor > 0 ? (
							<TableRow
								label={`Hushed for another ${snoozedFor} min`}
								subLabel="Judgement is paused. Pattern checks keep running. Tap to resume."
								icon={rowIcon('ClockIcon', 'ic_timer')}
								onPress={() => set({ snoozedUntil: 0 })}
							/>
						) : null}
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Checks"
							subLabel={`Patterns: ${patternsOn || 'none on'}. Judgement: ${judgementSummary}.`}
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(CHECKS_ROUTE)}
						/>
						<TableRow
							label="Try a draft"
							subLabel="See what would happen to a message, without sending it"
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							arrow
							onPress={() => navigation.navigate(TRY_ROUTE)}
						/>
						<TableRow
							label="What leaves the device"
							subLabel="Exactly what is sent, when, and what never is"
							icon={rowIcon('LockIcon', 'ic_lock')}
							arrow
							onPress={() => navigation.navigate(PRIVACY_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Logging, hook status and the draft-restore route"
							icon={rowIcon('BugIcon', 'ic_debug')}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
