import { DEFAULTS } from '../../defaults'
import { isReachingOut, scoreDraft } from '../../lib/gate'
import { scanPatterns } from '../../lib/secrets'
import { aiStatus, getStorage } from '../../lib/state'
import { useBottomPadding } from '../safeArea'

const EXAMPLES = [
	'sk-abcdefghijklmnopqrstuvwxyz123456',
	'i live at 123 fake street',
	'WHAT IS WRONG WITH YOU',
	'wjhy dont you evr repsond to me',
	'that fucking meeting ran long again lol',
]

/**
 * A draft, and what would happen to it.
 *
 * This runs the same functions the send path runs, so it cannot drift from real behaviour. It
 * also reports what a *switched-off* check would have caught, which the first version did not:
 * typing an address with the personal-details toggle off looked exactly like an address the
 * plugin could not detect at all, and that one silence cost an evening of confusion.
 */
export default function TryDraft() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, TableRowGroup, TableRow, TextInput, Card } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	const [probe, setProbe] = React.useState('')
	const status = aiStatus()

	const verdict = (() => {
		if (!probe.trim()) return null

		const asConfigured = scanPatterns(probe, {
			checkCredentials: s.checkCredentials,
			checkPersonalDetails: s.checkPersonalDetails,
			personalDetailsApply: true,
		})
		if (asConfigured) {
			return {
				title: 'Held immediately',
				detail: `${asConfigured.reason} No AI involved.`,
			}
		}

		const ifEverythingOn = scanPatterns(probe, {
			checkCredentials: true,
			checkPersonalDetails: true,
			personalDetailsApply: true,
		})
		if (ifEverythingOn) {
			const which =
				ifEverythingOn.category === 'credentials'
					? 'Credentials'
					: 'Personal details'
			return {
				title: 'Would be held, but the switch is off',
				detail: `${ifEverythingOn.reason} Turn on ${which} under Checks.`,
			}
		}

		if (isReachingOut(probe)) {
			return {
				title: 'Always passes',
				detail:
					'This reads as reaching out about your own wellbeing, which is never held and never sent anywhere.',
			}
		}

		if (status !== 'ready') {
			const why =
				status === 'absent'
					? 'AI Core is not installed'
					: status === 'unconfigured'
						? 'AI Core has no key set'
						: "AI Core's daily cap is spent"
			return {
				title: 'Sends straight out',
				detail: `Nothing in the patterns, and ${why}.`,
			}
		}

		if (!s.checkHostile && !s.checkDrunk && !s.checkOversharing) {
			return {
				title: 'Sends straight out',
				detail:
					'Nothing in the patterns, and no judgement checks are switched on.',
			}
		}

		if (probe.length < s.minLength) {
			return {
				title: 'Sends straight out',
				detail: `Shorter than ${s.minLength} characters, so it never reaches the AI.`,
			}
		}

		const { score, signals } = scoreDraft(probe, {
			checkHostile: s.checkHostile,
			checkDrunk: s.checkDrunk,
			checkOversharing: s.checkOversharing,
			hour: new Date().getHours(),
		})
		const detail = `Scored ${score} against a threshold of ${s.sensitivity}. ${
			signals.length ? signals.join(', ') : 'No signals'
		}.`

		return score >= s.sensitivity
			? { title: 'Would cost one AI call', detail }
			: { title: 'Sends straight out, free', detail }
	})()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Nothing typed here is sent anywhere, whatever the verdict says. It
						is scored as though you were in a server, so the personal-details
						check applies regardless of its DM setting.
					</Text>

					<TableRowGroup title="Draft">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<TextInput
								placeholder="Type a message"
								value={probe}
								multiline
								isClearable
								onChange={setProbe}
							/>
						</View>
					</TableRowGroup>

					{verdict ? (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-default" variant="text-md/semibold">
									{verdict.title}
								</Text>
								<Text
									color="text-muted"
									variant="text-sm/normal"
									style={{ marginTop: 8 }}
								>
									{verdict.detail}
								</Text>
							</View>
						</Card>
					) : null}

					<TableRowGroup title="Try one of these">
						{EXAMPLES.map(example => (
							<TableRow
								key={example}
								label={
									example.length > 44 ? `${example.slice(0, 44)}…` : example
								}
								onPress={() => setProbe(example)}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
