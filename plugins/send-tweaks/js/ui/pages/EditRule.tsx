import { copyText } from '../../lib/clipboard'
import { greetingsUnlocked, PLACEHOLDERS, tryUnlock } from '../../lib/greetings'
import { exportRule } from '../../lib/importRules'
import {
	deleteRule,
	getEditing,
	updateRule,
	useRules,
} from '../../lib/ruleStore'
import { compileRule, type Rule } from '../../lib/textReplace'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import { TemplateHelpButton } from '../components/TemplateHelp'
import { validateTemplate } from '../../lib/templateValidation'
import { settings } from '../../lib/state'
import { clearTemplateSession } from '../templateSession'

function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({
		key: 'SendTweaksRuleToast',
		content,
	})
}

/**
 * A multi-line field that keeps its own text while you type. Bound straight to the rule store, each
 * keystroke came back a moment later and Discord's TextArea put that older text back, so the cursor
 * jumped and deletes fought you. The store still gets every change; it just never drives the field.
 * Seeded once: the screen pins its rule on mount, so nothing else edits this text meanwhile.
 */
function LinesField({ value, onChange, ...rest }: { value: string; onChange: (value: string) => void } & Record<string, unknown>) {
	const { React } = revenge.react
	const { TextInput, TextArea } = revenge.discord.design.Design
	// TextArea is Discord's multi-line field, so Enter adds a line. TextInput with `multiline` didn't
	// on the phone (348/349); it's only the fallback if a Discord update drops TextArea.
	const Input = (TextArea ?? TextInput) as any
	const [draft, setDraft] = React.useState(value)
	return (
		<Input
			{...rest}
			multiline
			value={draft}
			onChange={(next: string) => {
				setDraft(next)
				onChange(next)
			}}
		/>
	)
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
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as any

	// Pinned on mount, so opening another rule later cannot swap this screen's rule underneath it.
	const [target] = React.useState(getEditing())
	const kind = target?.kind ?? 'text'
	const rules = useRules(kind)
	const rule = rules.find(r => r.id === target?.id)
	const unlocked = greetingsUnlocked()
	React.useEffect(() => clearTemplateSession, [])
	const [replacementRevision, bumpReplacement] = React.useReducer((n: number) => n + 1, 0)
	React.useLayoutEffect(() => {
		navigation.setOptions?.({ headerRight: unlocked && rule && target ? () => <TemplateHelpButton initial={rule.replace} apply={text => {
			updateRule(kind, target.id, { replace: text })
			bumpReplacement()
		}} /> : () => null })
		return () => navigation.setOptions?.({ headerRight: () => null })
	}, [navigation, unlocked, rule?.replace, target, kind])

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
				content={
					rule.find
						? `"${rule.find}" → "${rule.replace}"`
						: 'This rule is empty.'
				}
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
					<TableRowGroup title="Rule">
						<FieldRow label="Name">
							<TextInput
								placeholder={
									links ? 'Optional, e.g. Twitter to fxtwitter' : 'Optional'
								}
								value={rule.name ?? ''}
								onChange={(value: string) => set({ name: value || undefined })}
							/>
						</FieldRow>
						<FieldRow label="Find">
							<LinesField
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
								onChange={(value: string) => {
									set({ find: value })
									if (!links && tryUnlock(value))
										showToast('Greetings unlocked: placeholders now work in Replace with')
								}}
							/>
						</FieldRow>
						<FieldRow
							label="Replace with"
							description={
								(rule.regex
									? `Use $1, $2 … for captured groups, and \\n for a line break.${links ? '' : ' Find ^ or $ alone to add text to the start or end of every message.'}`
									: 'Used exactly as typed, line breaks included.') +
								(!links && greetingsUnlocked()
									? ` Greetings: ${PLACEHOLDERS.map(key => `{${key}}`).join(' ')}. {mention} is who you reply to, or whoever joined last.`
									: '')
							}
						>
							<LinesField
								key={`replacement-${replacementRevision}`}
								placeholder="Leave empty to delete what was found"
								value={rule.replace}
								onChange={(value: string) => set({ replace: value })}
							/>
						</FieldRow>
					</TableRowGroup>

					{unlocked ? validateTemplate(rule.replace, rule.replace, settings().snippets ?? []).map(warning => <Text key={warning} variant="text-sm/normal" color="text-feedback-warning">{warning}</Text>) : null}

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
								showToast(
									copyText(exportRule(rule))
										? 'Rule copied.'
										: 'Could not reach the clipboard.',
								)
							}
						/>
						<TableRow
							variant="danger"
							label="Delete rule"
							icon={dangerIcon('TrashIcon', 'ic_trash_24px')}
							onPress={confirmDelete}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
