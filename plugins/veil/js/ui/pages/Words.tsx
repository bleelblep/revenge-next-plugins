import { DEFAULTS } from '../../defaults'
import { getStorage, patch } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

/**
 * The word list, as a list.
 *
 * One word per row with a tap to remove it, rather than a comma-separated line in a text box: the
 * rows are the repo's settings language (docs/plugin-design-language.md §3.2), and a list of
 * things is easier to check at a glance than a sentence of commas.
 *
 * The field is a bare `TextInput` in the `Stack`, the way Translate's language search is -- a
 * lone input boxed inside a `TableRowGroup` reads as a row that lost its row.
 */
export default function Words() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TextInput } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const words: string[] = s.words ?? []

	const [draft, setDraft] = React.useState('')

	const add = () => {
		const word = draft.trim()
		if (!word) return
		// Case-insensitive duplicate check, since matching is case-insensitive too.
		if (!words.some(existing => existing.toLowerCase() === word.toLowerCase())) {
			patch({ words: [...words, word] })
		}
		setDraft('')
	}

	const remove = (word: string) =>
		patch({ words: words.filter(existing => existing !== word) })

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TextInput
						label="Add a word or phrase"
						placeholder="finale"
						description="Not case-sensitive. Endings are included, so “spoiler” also catches “spoilers”."
						value={draft}
						returnKeyType="done"
						isClearable
						onChange={setDraft}
					/>

					<TableRowGroup hasIcons>
						<TableRow
							label="Add to the list"
							subLabel={draft.trim() ? `Blur messages mentioning “${draft.trim()}”` : 'Type a word above first'}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
							disabled={!draft.trim()}
							onPress={add}
						/>
					</TableRowGroup>

					{words.length ? (
						<TableRowGroup title={`Blurring ${words.length} word${words.length === 1 ? '' : 's'} — tap one to remove it`} hasIcons>
							{words.map(word => (
								<TableRow
									key={word}
									label={word}
									icon={rowIcon('TextIcon', 'ic_text')}
									onPress={() => remove(word)}
								/>
							))}
						</TableRowGroup>
					) : (
						<Text color="text-muted" variant="text-sm/normal">
							No words yet. Anything you add here is checked on this device, costs
							nothing, and never leaves your phone.
						</Text>
					)}

					<TableRowGroup title="Matching" hasIcons>
						<TableSwitchRow
							label="Catch broken-up spellings"
							subLabel="Also matches a word written like f.i.n.a.l.e or f i n a l e. Catches more, and blurs more by mistake."
							icon={rowIcon('SearchIcon', 'ic_search')}
							value={!!s.looseWords}
							onValueChange={value => patch({ looseWords: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
