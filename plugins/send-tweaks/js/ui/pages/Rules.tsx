import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { compileRule, newRule } from '../../lib/textReplace'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { Rule } from '../../lib/textReplace'

/**
 * The rules, edited in place.
 *
 * Each rule is its own group with its fields inline rather than behind a tap, because a rule is
 * two short strings and three switches -- a separate edit page per rule would be more navigation
 * than content.
 *
 * Every change writes the *whole* list. `jsonStorage.set()` replaces arrays rather than merging
 * them, so that is what makes a deletion stick (see the note on `rules` in `types.ts`).
 */
export default function Rules() {
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
		AlertModal,
		AlertActionButton,
	} = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const rules: Rule[] = s.rules ?? []

	const write = (next: Rule[]) => storage?.set({ rules: next })
	const update = (id: string, patch: Partial<Rule>) =>
		write(rules.map(rule => (rule.id === id ? { ...rule, ...patch } : rule)))
	const add = () => write([...rules, newRule()])

	const confirmDelete = (rule: Rule, index: number) => {
		const key = 'SendTweaksDeleteRule'
		Alerts.openAlert(
			key,
			<AlertModal
				title={`Delete rule ${index + 1}?`}
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
								write(rules.filter(r => r.id !== rule.id))
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
					<Text color="text-muted" variant="text-sm/normal">
						Rules run top to bottom, each on the result of the one before. They
						never touch code blocks, links, mentions, custom emoji or timestamps.
						{s.textReplace
							? ''
							: ' Text replacement is switched off, so none of these run yet.'}
					</Text>

					{rules.map((rule, index) => {
						const compiled = rule.find ? compileRule(rule) : undefined
						const error =
							compiled && 'error' in compiled ? compiled.error : undefined

						return (
							<TableRowGroup key={rule.id} title={`Rule ${index + 1}`} hasIcons>
								<View
									style={{
										paddingHorizontal: 16,
										paddingVertical: 12,
										gap: 12,
									}}
								>
									<TextInput
										label="Find"
										placeholder={
											rule.regex ? 'A regular expression' : 'Text to look for'
										}
										value={rule.find}
										status={error ? 'error' : 'default'}
										errorMessage={error}
										onChange={value => update(rule.id, { find: value })}
									/>
									<TextInput
										label="Replace with"
										placeholder="Leave empty to delete what was found"
										description={
											rule.regex
												? 'Use $1, $2 … for captured groups. Find ^ or $ alone to add text to the start or end of every message.'
												: 'Used exactly as typed.'
										}
										value={rule.replace}
										onChange={value => update(rule.id, { replace: value })}
									/>
								</View>
								<TableSwitchRow
									label="On"
									value={!!rule.enabled}
									onValueChange={value => update(rule.id, { enabled: value })}
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
									onValueChange={value => update(rule.id, { wholeWord: value })}
								/>
								<TableSwitchRow
									label="Match case"
									subLabel='Off means "Cat" and "cat" both match.'
									value={!!rule.caseSensitive}
									onValueChange={value =>
										update(rule.id, { caseSensitive: value })
									}
								/>
								<TableSwitchRow
									label="Regular expression"
									subLabel="For advanced patterns. A pattern that is not valid is skipped, never sent."
									value={!!rule.regex}
									onValueChange={value => update(rule.id, { regex: value })}
								/>
								<TableRow
									label="Delete rule"
									icon={rowIcon('TrashIcon', 'ic_trash_24px')}
									onPress={() => confirmDelete(rule, index)}
								/>
							</TableRowGroup>
						)
					})}

					<TableRowGroup hasIcons>
						<TableRow
							label="Add a rule"
							subLabel={
								rules.length
									? undefined
									: 'For example: find "teh", replace with "the".'
							}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
							arrow
							onPress={add}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
