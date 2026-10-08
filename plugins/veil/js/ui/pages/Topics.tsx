import { DEFAULTS } from '../../defaults'
import { repaintChannel } from '../../lib/repaint'
import { draftTopic } from '../../lib/topicAi'
import { getAi, getStorage, patch, TAG } from '../../lib/state'
import { FieldRow } from '../fieldGroup'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { Topic } from '../../types'

const ALERT_KEY = 'VeilTopic'

/** The open channel is the one the user will look at next, so it is redrawn with the new rules. */
function repaintCurrent() {
	try {
		const id = (revenge.discord.flux.Stores as any).SelectedChannelStore?.getChannelId?.()
		if (id) repaintChannel(id)
	} catch {
		/* the next scroll picks it up */
	}
}

function preview(words: string[], max = 4): string {
	return `${words.slice(0, max).join(', ')}${words.length > max ? '…' : ''}`
}

function newId(): string {
	return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

/**
 * One saved rule in Discord's alert dialog: its words in full, then on/off, remove, close. A
 * dialog rather than another page, because there is nothing to edit -- a different rule is a
 * new description.
 */
function openTopic(topic: Topic, topics: Topic[]) {
	const { AlertModal, AlertActionButton, Text } = revenge.discord.design.Design as any
	const { ScrollView, Dimensions } = revenge.react.ReactNative
	const React = revenge.react.React
	const alerts = revenge.discord.actions.AlertActionCreators
	const close = () => alerts.dismissAlert(ALERT_KEY)
	const write = (next: Topic[]) => {
		patch({ topics: next })
		repaintCurrent()
		close()
	}

	try {
		alerts.openAlert(
			ALERT_KEY,
			<AlertModal
				title={topic.name}
				extraContent={
					<ScrollView style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.4) }} nestedScrollEnabled>
						{topic.description ? (
							<Text variant="text-sm/normal" color="text-muted" style={{ marginBottom: 8 }}>
								Made from “{topic.description}”
							</Text>
						) : null}
						<Text variant="text-md/normal" color="text-default" selectable>
							{topic.words.join(', ')}
						</Text>
					</ScrollView>
				}
				actions={
					<>
						<AlertActionButton
							text={topic.enabled ? 'Turn off' : 'Turn on'}
							variant="primary"
							onPress={() =>
								write(topics.map(t => (t.id === topic.id ? { ...t, enabled: !t.enabled } : t)))
							}
						/>
						<AlertActionButton
							text={topic.stickers ? 'Stop checking stickers and emoji' : 'Check stickers and emoji too'}
							variant="secondary"
							onPress={() =>
								write(topics.map(t => (t.id === topic.id ? { ...t, stickers: !t.stickers } : t)))
							}
						/>
						<AlertActionButton
							text="Remove"
							variant="destructive"
							onPress={() => write(topics.filter(t => t.id !== topic.id))}
						/>
						<AlertActionButton text="Close" variant="secondary" onPress={close} />
					</>
				}
			/>,
		)
	} catch (error) {
		console.error(`${TAG} could not open the rule:`, error)
	}
}

/**
 * Described rules: say what to blur, AI Core writes the words once, and the device matches them.
 *
 * The flow is describe -> check the words (tap one to leave it out) -> save. The only thing that
 * leaves the phone is the description, once per rule; messages are never sent anywhere.
 */
export default function Topics() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, Card, TableRowGroup, TableRow, TextInput } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const topics: Topic[] = Array.isArray(s.topics) ? s.topics : []
	const legacy = (s.customCategory ?? '').trim()

	const [description, setDescription] = React.useState('')
	const [busy, setBusy] = React.useState(false)
	const [error, setError] = React.useState('')
	const [draft, setDraft] = React.useState<{ name: string; description: string; words: string[] } | undefined>()
	const [left, setLeft] = React.useState<Set<string>>(new Set())

	const ai = getAi()
	const budget = (() => {
		try {
			return ai?.budget()
		} catch {
			return undefined
		}
	})()

	const make = async (text: string) => {
		const wanted = text.trim()
		if (!wanted || busy) return
		setBusy(true)
		setError('')
		setDraft(undefined)
		setLeft(new Set())
		const result = await draftTopic(wanted)
		setBusy(false)
		if (result.ok) setDraft({ name: result.name, description: wanted, words: result.words })
		else setError(result.error)
	}

	const save = () => {
		if (!draft) return
		const words = draft.words.filter(word => !left.has(word))
		if (!words.length) return
		const topic: Topic = { id: newId(), name: draft.name, description: draft.description, words, enabled: true }
		patch({
			topics: [...topics, topic],
			// Made from the old category: it has done its job.
			...(legacy && draft.description === legacy ? { customCategory: '' } : {}),
		})
		setDraft(undefined)
		setDescription('')
		repaintCurrent()
	}

	const toggleWord = (word: string) => {
		const next = new Set(left)
		if (next.has(word)) next.delete(word)
		else next.add(word)
		setLeft(next)
	}

	const kept = draft ? draft.words.length - left.size : 0

	return (
		<Page>
			<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Describe it once, matched on your phone
							</Text>
							<Text color="text-muted" variant="text-sm/normal" style={{ marginTop: 8 }}>
								AI Core turns your description into a list of words and phrases, one call per rule.
								After that, messages are checked on this device like the Words list: free, instant, and
								nothing you read is ever sent anywhere.
							</Text>
						</View>
					</Card>

					{!ai ? (
						<Text color="text-muted" variant="text-sm/normal">
							Install AI Core to make a rule from a description. Words, people and channels work without
							it.
						</Text>
					) : (
						<>
							{legacy ? (
								<TableRowGroup title="From an older version" hasIcons>
									<TableRow
										label={`Make a rule from “${legacy}”`}
										subLabel="Your old category is no longer checked message by message. This turns it into a rule."
										icon={rowIcon('MagicWandIcon', 'ic_star')}
										disabled={busy}
										onPress={() => {
											setDescription(legacy)
											make(legacy)
										}}
									/>
									<TableRow
										label="Dismiss"
										subLabel="Forget the old category"
										icon={rowIcon('XSmallIcon', 'CloseSmallIcon', 'ic_close_16px')}
										onPress={() => patch({ customCategory: '' })}
									/>
								</TableRowGroup>
							) : null}

							<TableRowGroup hasIcons>
								<FieldRow
									label="Blur anything about"
									description="In your own words. Only this is sent to AI Core."
								>
									<TextInput
										placeholder="diets and weight loss"
										value={description}
										returnKeyType="done"
										isClearable
										onChange={setDescription}
									/>
								</FieldRow>
								<TableRow
									label={busy ? 'Asking AI Core…' : 'Make a rule'}
									subLabel={
										error ||
										(!budget?.configured
											? 'Set an API key in AI Core first'
											: `Uses one of ${budget.remaining} AI Core calls left today`)
									}
									icon={rowIcon('MagicWandIcon', 'ic_star')}
									disabled={busy || !description.trim()}
									onPress={() => make(description)}
								/>
							</TableRowGroup>
						</>
					)}

					{draft ? (
						<>
							<TableRowGroup
								title={`“${draft.name}”: ${kept} of ${draft.words.length} words. Tap one to leave it out`}
								hasIcons
							>
								{draft.words.map(word => (
									<TableRow
										key={word}
										label={word}
										subLabel={left.has(word) ? 'Left out' : undefined}
										icon={
											left.has(word)
												? rowIcon('XSmallIcon', 'CloseSmallIcon', 'ic_close_16px')
												: rowIcon('CircleCheckIcon', 'ic_check')
										}
										onPress={() => toggleWord(word)}
									/>
								))}
							</TableRowGroup>
							<TableRowGroup hasIcons>
								<TableRow
									label="Save as rule"
									subLabel={kept ? `Blur messages about ${draft.name}` : 'Keep at least one word'}
									icon={rowIcon('CircleCheckIcon', 'ic_check')}
									disabled={!kept}
									onPress={save}
								/>
								<TableRow
									label="Discard"
									icon={rowIcon('TrashIcon', 'ic_trash_24px')}
									onPress={() => setDraft(undefined)}
								/>
							</TableRowGroup>
						</>
					) : null}

					{topics.length ? (
						<TableRowGroup title="Your rules. Tap one to see or change it" hasIcons>
							{topics.map(topic => (
								<TableRow
									key={topic.id}
									label={topic.enabled ? topic.name : `${topic.name} (off)`}
									subLabel={`${topic.words.length} words${topic.stickers ? ', stickers and emoji too' : ''}: ${preview(topic.words)}`}
									icon={rowIcon(topic.enabled ? 'EyeSlashIcon' : 'EyeIcon', topic.enabled ? 'ic_hide' : 'ic_eye')}
									arrow
									onPress={() => openTopic(topic, topics)}
								/>
							))}
						</TableRowGroup>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
