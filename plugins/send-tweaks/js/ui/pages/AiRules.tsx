import type { RuleKind } from '../../lib/ruleStore'
import AiDraft from '../components/AiDraft'
import { useBottomPadding } from '../safeArea'

/**
 * Send Tweaks' AI screen: writing a link rule or a text rule from a description, in one place.
 *
 * This is where the AI Hub and AI Core's settings send people (the route given to AI Core's
 * `setSettingsRoute`), because the same feature also sits on each Ready-made screen and the AI Hub
 * needs a single destination. Registered only while AI Core is installed.
 */
export default function AiRules() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRadioGroup, TableRadioRow } = revenge.discord.design.Design

	const [kind, setKind] = React.useState<RuleKind>('links')

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Describe what you want and AI Core writes the rule, with examples tested
						on your phone before you add it. The rest of Send Tweaks works without AI.
					</Text>

					<TableRadioGroup
						title="Kind of rule"
						defaultValue={kind}
						onChange={(value: string) => setKind(value as RuleKind)}
					>
						<TableRadioRow
							label="Link rule"
							subLabel="Changes links, like making a site embed properly"
							value="links"
						/>
						<TableRadioRow
							label="Text rule"
							subLabel="Changes the words you send"
							value="text"
						/>
					</TableRadioGroup>

					{/* Keyed, so switching kind starts a fresh draft instead of carrying one over. */}
					<AiDraft key={kind} kind={kind} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
