import { DEFAULTS } from '../../defaults'
import { repaintChannel } from '../../lib/repaint'
import { getStorage, patch, TAG } from '../../lib/state'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

const ALERT_KEY = 'VeilWord'
const keyOf = (word: string) => word.trim().toLowerCase()

/** The open channel is the one the user will look at next, so it is redrawn with the change. */
function repaintCurrent() {
	try {
		const id = (revenge.discord.flux.Stores as any).SelectedChannelStore?.getChannelId?.()
		if (id) repaintChannel(id)
	} catch {
		/* the next scroll picks it up */
	}
}

/**
 * One word in Discord's alert dialog, the way a described rule opens: whether it also checks
 * sticker names, remove, close.
 */
function openWord(word: string, words: string[], stickerWords: string[]) {
	const { AlertModal, AlertActionButton, Text } = revenge.discord.design.Design as any
	const alerts = revenge.discord.actions.AlertActionCreators
	const close = () => alerts.dismissAlert(ALERT_KEY)
	const stickers = stickerWords.some(w => keyOf(w) === keyOf(word))
	const others = stickerWords.filter(w => keyOf(w) !== keyOf(word))
	const write = (value: Parameters<typeof patch>[0]) => {
		patch(value)
		repaintCurrent()
		close()
	}

	try {
		alerts.openAlert(
			ALERT_KEY,
			<AlertModal
				title={word}
				extraContent={
					<Text variant="text-sm/normal" color="text-muted">
						{stickers
							? 'Blurs messages that mention it, hides stickers whose name matches it, and covers custom emoji with that name.'
							: 'Blurs messages that mention it. Stickers and custom emoji are only covered when their message is blurred.'}
					</Text>
				}
				actions={
					<>
						<AlertActionButton
							text={stickers ? 'Stop checking stickers and emoji' : 'Check stickers and emoji too'}
							variant="primary"
							onPress={() => write({ stickerWords: stickers ? others : [...others, word] })}
						/>
						<AlertActionButton
							text="Remove"
							variant="destructive"
							onPress={() => write({ words: words.filter(w => w !== word), stickerWords: others })}
						/>
						<AlertActionButton text="Close" variant="secondary" onPress={close} />
					</>
				}
			/>,
		)
	} catch (error) {
		console.error(`${TAG} could not open the word:`, error)
	}
}

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

	const stickerWords: string[] = s.stickerWords ?? []
	const checksStickers = (word: string) => stickerWords.some(w => keyOf(w) === keyOf(word))

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TableRowGroup hasIcons>
						<FieldRow
							label="Add a word or phrase"
							description="Not case-sensitive. Endings are included, so “spoiler” also catches “spoilers”."
						>
							<TextInput
								placeholder="finale"
								value={draft}
								returnKeyType="done"
								isClearable
								onChange={setDraft}
							/>
						</FieldRow>
						<TableRow
							label="Add to the list"
							subLabel={draft.trim() ? `Blur messages mentioning “${draft.trim()}”` : 'Type a word above first'}
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')}
							disabled={!draft.trim()}
							onPress={add}
						/>
					</TableRowGroup>

					{words.length ? (
						<TableRowGroup title={`Blurring ${words.length} word${words.length === 1 ? '' : 's'}. Tap one to change or remove it`} hasIcons>
							{words.map(word => (
								<TableRow
									key={word}
									label={word}
									subLabel={checksStickers(word) ? 'Stickers and emoji too' : undefined}
									icon={rowIcon('TextIcon', 'ic_text')}
									arrow
									onPress={() => openWord(word, words, stickerWords)}
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
