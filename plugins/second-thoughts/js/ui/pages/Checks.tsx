import { DEFAULTS } from '../../defaults'
import { aiStatus, getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SecondThoughtsStorage } from '../../types'

/**
 * Every toggle, on one route so the root page stays an index.
 *
 * The two groups are deliberately not presented as equals: the first works with nothing
 * installed, the second is inert without AI Core and says so in its own group description
 * rather than leaving the user to discover it by flipping a switch that does nothing.
 */
export default function Checks() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow, Slider } =
		revenge.discord.design.Design

	// A plain navigator route, so there is no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<SecondThoughtsStorage>) => storage?.set(patch)

	const status = aiStatus()
	const judgementLive = status === 'ready'

	const judgementNote = (() => {
		switch (status) {
			case 'absent':
				return 'AI Core is not installed, so none of these run. They stay switched on so that installing it later needs no further setup.'
			case 'unconfigured':
				return 'AI Core is installed but has no API key, so none of these run yet. Set one in AI Core > Provider.'
			case 'exhausted':
				return "AI Core's daily cap is spent, so none of these will run again until tomorrow. Raise the cap in AI Core > Usage and limits."
			default:
				return 'These cost an AI call, but only on a draft the free local gate below has already flagged.'
		}
	})()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Patterns — free, nothing else needed" hasIcons>
						<TableSwitchRow
							label="Credentials"
							subLabel="API keys, tokens, private keys, card numbers. Nobody pastes these on purpose."
							icon={rowIcon('LockIcon', 'ic_lock')}
							value={!!s.checkCredentials}
							onValueChange={value => set({ checkCredentials: value })}
						/>
						<TableSwitchRow
							label="Personal details"
							subLabel="Phone numbers, emails, street addresses. Off by default, because these are usually shared deliberately."
							icon={rowIcon('IdCardIcon', 'ic_profile')}
							value={!!s.checkPersonalDetails}
							onValueChange={value => set({ checkPersonalDetails: value })}
						/>
						<TableSwitchRow
							label="Personal details in DMs too"
							subLabel="Off means the check only applies in servers, where the audience is larger. Handing a friend your number is not the case worth stopping."
							icon={rowIcon('GroupIcon')}
							disabled={!s.checkPersonalDetails}
							value={!!s.personalDetailsInDms}
							onValueChange={value => set({ personalDetailsInDms: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Judgement — needs AI Core" hasIcons>
						<TableSwitchRow
							label="Hostile"
							subLabel="Anger aimed at a person. The message you would regret in ten minutes."
							icon={rowIcon('FireIcon', 'ic_warning_24px')}
							disabled={!judgementLive}
							value={!!s.checkHostile}
							onValueChange={value => set({ checkHostile: value })}
						/>
						<TableSwitchRow
							label="Drunk or half asleep"
							subLabel="Gated on stretched words, typing that has come apart, and the hour."
							icon={rowIcon('ClockIcon', 'ic_timer')}
							disabled={!judgementLive}
							value={!!s.checkDrunk}
							onValueChange={value => set({ checkDrunk: value })}
						/>
						<TableSwitchRow
							label="Oversharing"
							subLabel="Money, medical details, work confidences, a third party's secret. The vaguest of the three, so expect more false alarms."
							icon={rowIcon('EyeIcon', 'ic_eye')}
							disabled={!judgementLive}
							value={!!s.checkOversharing}
							onValueChange={value => set({ checkOversharing: value })}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						{judgementNote}
					</Text>

					<TableRowGroup title={`Sensitivity — ${s.sensitivity}`}>
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-muted" variant="text-sm/normal">
								How suspicious a draft has to look to this device before it is
								worth asking the AI about. Lower catches more and costs more.
								Three is a handful of calls a day.
							</Text>
							<Slider
								step={1}
								value={s.sensitivity}
								minimumValue={1}
								maximumValue={8}
								onValueChange={value => set({ sensitivity: Math.round(value) })}
							/>
						</View>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
