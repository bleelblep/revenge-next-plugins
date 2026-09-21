import { DEFAULTS } from '../../defaults'
import { requestText } from '../../lib/client'
import { getStorage, settings } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { AiCoreStorage } from '../../types'

const TEST_ID = 'bleelblep.ai-core (connection test)'

/** Developer tools only. Anything that spends money or prints internals belongs here. */
export default function Debug() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)

	const [result, setResult] = React.useState<string | null>(null)
	const [testing, setTesting] = React.useState(false)

	const runTest = async () => {
		if (testing) return
		setTesting(true)
		setResult('Calling…')
		try {
			const reply = await requestText(TEST_ID, {
				messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
				maxTokens: 8,
			})
			// Spends one call against the cap, which is why it lives on the debug page.
			setResult(
				reply
					? `Answered: ${reply.trim().slice(0, 80)}`
					: settings().apiKey
						? 'No answer. Check the key, the base URL, and logcat under ReactNativeJS.'
						: 'No key set, so nothing was sent.',
			)
		} catch (error) {
			setResult(`Threw: ${String(error)}`)
		} finally {
			setTesting(false)
		}
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Debug logging"
							subLabel="Prints every call, its token counts and its failures to logcat under ReactNativeJS"
							icon={rowIcon('BugIcon', 'ic_debug')}
							value={!!s.debugLogging}
							onValueChange={value => set({ debugLogging: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Connection" hasIcons>
						<TableRow
							label={testing ? 'Testing…' : 'Send a test call'}
							subLabel="Spends one call against today's cap"
							icon={rowIcon('LinkIcon', 'ic_link')}
							arrow
							onPress={runTest}
						/>
					</TableRowGroup>

					{result ? (
						<Text color="text-muted" variant="text-sm/normal">
							{result}
						</Text>
					) : null}

					<TableRowGroup title="Resolved configuration">
						<TableRow
							label="Endpoint"
							subLabel={`${s.baseUrl.replace(/\/+$/, '')}/chat/completions`}
						/>
						<TableRow label="Model" subLabel={s.model || '(unset)'} />
						<TableRow
							label="Key"
							subLabel={
								s.apiKey ? `set, ${s.apiKey.length} characters` : 'not set'
							}
						/>
						<TableRow label="Timeout" subLabel={`${s.timeoutMs} ms`} />
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
