import { copyText } from '../../lib/clipboard'
import { exportRule } from '../../lib/importRules'
import { deleteRule, getEditing, updateRule, useRules } from '../../lib/ruleStore'
import { compileRule, type Rule } from '../../lib/textReplace'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: 'SendTweaksRuleToast', content })
}

/** One rule, on its own screen. Opened from a rule list (`Rules.tsx`). */
export default function EditRule() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		TextInput,
		AlertModal,
		AlertActionButton,
	} = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any

	// Pinned on mount, so opening another rule later cannot swap this screen's rule underneath it.
	const [target] = React.useState(getEditing())
	const kind = target?.kind ?? 'text'
	const rules = useRules(kind)
	const rule = rules.find(r => r.id === target?.id)

	if (!target || !rule) {
		return (
			<Page>
				<View style={{ padding: 16 }}>
					<Text color="text-muted" variant="text-sm/normal">
						This rule no longer exists.
					</Text>
				</View>
			</Page>
		)
	}

	const links = kind === 'links'
	const set = (patch: Partial<Rule>) => updateRule(kind, rule.id, patch)
	const error = rule.find ? compileRule(rule).error : undefined

	const confirmDelete = () => {
		const key = 'SendTweaksDeleteRule'
		Alerts.openAlert(
			key,
			<AlertModal
				title={`Delete ${rule.name ? `“${rule.name}”` : 'this rule'}?`}
				content={rule.find ? `"${rule.find}" → "${rule.replace}"` : 'This rule is empty.'}
				actions={
					<>
						<AlertActionButton
							text="Delete"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								deleteRule(kind, rule.id)
								navigation?.goBack?.()
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
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Stack spacing={16}>
						<TextInput
							label="Name"
							placeholder={links ? 'Optional, e.g. Twitter to fxtwitter' : 'Optional'}
							value={rule.name ?? ''}
							onChange={(value: string) => set({ name: value || undefined })}
						/>
						<TextInput
							label="Find"
							placeholder={
								rule.regex
									? 'A regular expression'
									: links
										? 'Part of a link, e.g. twitter.com'
										: 'Text to look for'
							}
							value={rule.find}
							status={error ? 'error' : 'default'}
							errorMessage={error}
							onChange={(value: string) => set({ find: value })}
						/>
						<TextInput
							label="Replace with"
							placeholder="Leave empty to delete what was found"
							description={
								rule.regex
									? `Use $1, $2 … for captured groups.${links ? '' : ' Find ^ or $ alone to add text to the start or end of every message.'}`
									: 'Used exactly as typed.'
							}
							value={rule.replace}
							onChange={(value: string) => set({ replace: value })}
						/>
					</Stack>

					<TableRowGroup title="Options">
						<TableSwitchRow
							label="On"
							value={!!rule.enabled}
							onValueChange={(value: boolean) => set({ enabled: value })}
						/>
						<TableSwitchRow
							label="Regular expression"
							subLabel="For advanced patterns. A pattern that is not valid is skipped, never sent."
							value={!!rule.regex}
							onValueChange={(value: boolean) => set({ regex: value })}
						/>
						<TableSwitchRow
							label="Match case"
							subLabel='Off means "Cat" and "cat" both match.'
							value={!!rule.caseSensitive}
							onValueChange={(value: boolean) => set({ caseSensitive: value })}
						/>
						<TableSwitchRow
							label="Whole words only"
							subLabel={
								rule.regex
									? 'Not used for regular expressions — write \\b yourself.'
									: '"cat" matches "cat" but not "concatenate".'
							}
							disabled={rule.regex}
							value={!!rule.wholeWord}
							onValueChange={(value: boolean) => set({ wholeWord: value })}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableRow
							label="Copy as JSON"
							subLabel="In Text Replace's format, to share it"
							icon={rowIcon('CopyIcon')}
							disabled={!rule.find}
							onPress={() =>
								showToast(copyText(exportRule(rule)) ? 'Rule copied.' : 'Could not reach the clipboard.')
							}
						/>
						<TableRow
							label="Delete rule"
							icon={rowIcon('TrashIcon', 'ic_trash_24px')}
							onPress={confirmDelete}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
