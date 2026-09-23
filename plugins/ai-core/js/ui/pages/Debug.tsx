import { DEFAULTS } from '../../defaults'
import { requestText } from '../../lib/client'
import { getStorage } from '../../lib/state'
import { useVaultStatus, vaultStatus } from '../../lib/vault'
import { hostOf } from './Provider'
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
	const vault = useVaultStatus()

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
					: !vaultStatus().native
						? "AI Core's native part is not running, so nothing was sent."
						: vaultStatus().configured
							? 'No answer. Check the key, the endpoint, and logcat under ReactNativeJS.'
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
							subLabel={
								vault.endpoint
									? `${vault.endpoint}/chat/completions`
									: 'None — set a key first'
							}
						/>
						<TableRow label="Model" subLabel={s.model || '(unset)'} />
						<TableRow
							label="Key"
							subLabel={
								vault.configured
									? `set, in the Android keystore vault, bound to ${hostOf(vault.endpoint)}`
									: 'not set'
							}
						/>
						<TableRow
							label="Native vault"
							subLabel={
								!vault.native
									? 'not running'
									: vault.usageTampered
										? 'running; usage record was altered, calls blocked until reset'
										: 'running'
							}
						/>
						<TableRow label="Timeout" subLabel={`${s.timeoutMs} ms`} />
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
