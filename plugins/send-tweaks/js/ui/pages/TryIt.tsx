import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { transform } from '../../lib/transform'
import { useBottomPadding } from '../safeArea'

const EXAMPLES = [
	'https://youtu.be/dQw4w9WgXcQ?si=Abc123xyz',
	'look https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=3f9a2b',
	'https://x.com/user/status/123?s=20&t=Zk9q',
	'https://twitter.com/user/status/123 — a link rule can turn this into fxtwitter',
	'https://www.amazon.com/dp/B0ABC/ref=sr_1_3?keywords=mug&qid=1&sr=8-3',
	'`https://x.com/a?s=20` — inside code, left alone',
]

/**
 * A message in, exactly what would be sent out.
 *
 * Runs the same `transform` the send hook runs, with the same settings, so this can never
 * disagree with a real send. Nothing typed here is sent anywhere.
 */
export default function TryIt() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, Card, TableRowGroup, TableRow, TextInput } =
		revenge.discord.design.Design

	// Subscribing re-renders the preview when a setting or rule changes elsewhere.
	const storage = getStorage()
	void { ...DEFAULTS, ...(storage?.use() ?? {}) }

	const [draft, setDraft] = React.useState('')
	const result = draft ? transform(draft) : undefined

	const summary = !result
		? undefined
		: result.text === draft
			? 'Nothing would change — this would be sent exactly as typed.'
			: [
					result.cleaned &&
						`${result.cleaned} tracking parameter${result.cleaned === 1 ? '' : 's'} removed`,
					result.rewritten &&
						`${result.rewritten} link${result.rewritten === 1 ? '' : 's'} rewritten`,
					result.replaced &&
						`${result.replaced} rule${result.replaced === 1 ? '' : 's'} applied`,
				]
					.filter(Boolean)
					.join(', ')

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TextInput
						placeholder="Type or paste a message"
						value={draft}
						multiline
						isClearable
						onChange={setDraft}
					/>

					{result ? (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-muted" variant="text-sm/semibold">
									Would be sent as
								</Text>
								<Text
									color="text-default"
									variant="text-md/normal"
									style={{ marginTop: 8 }}
								>
									{result.text}
								</Text>
								<Text
									color="text-muted"
									variant="text-sm/normal"
									style={{ marginTop: 8 }}
								>
									{summary}
								</Text>
							</View>
						</Card>
					) : null}

					<TableRowGroup title="Try one of these">
						{EXAMPLES.map(example => (
							<TableRow
								key={example}
								label={example}
								onPress={() => setDraft(example)}
							/>
						))}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
