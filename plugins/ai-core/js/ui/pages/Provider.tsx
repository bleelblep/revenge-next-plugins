import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { clearKey, promptForKey, useVaultStatus } from '../../lib/vault'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { AiCoreStorage } from '../../types'

const trimUrl = (url: string) => url.trim().replace(/\/+$/, '').toLowerCase()

export function hostOf(url: string | null | undefined): string {
	if (!url) return 'nowhere'
	return url.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '')
}

/** Endpoint credentials and model choice. Nothing here is per-plugin. */
export default function Provider() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, TableRowGroup, TableRow, TextInput } =
		revenge.discord.design.Design

	// A plain navigator route, so there is no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)
	const vault = useVaultStatus()
	const [error, setError] = React.useState<string | null>(null)
	const mismatch =
		vault.configured &&
		!!vault.endpoint &&
		trimUrl(vault.endpoint) !== trimUrl(s.baseUrl)

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					{/*
					 * No text field for the key. It is typed into a native Android dialog, so it
					 * never exists in JS where another plugin could read it -- see AiCore.kt.
					 */}
					<TableRowGroup title="Credentials" hasIcons>
						<TableRow
							label={vault.configured ? 'Replace API key' : 'Set API key'}
							subLabel={
								!vault.native
									? "AI Core's native part is not running, so no key can be stored"
									: vault.configured
										? `Set, and only ever sent to ${hostOf(vault.endpoint)}`
										: `Opens a secure prompt. The key will only be sent to ${hostOf(s.baseUrl)}`
							}
							icon={rowIcon('KeyIcon', 'LockIcon', 'ic_lock')}
							arrow
							disabled={!vault.native}
							onPress={async () => {
								const next = await promptForKey(s.baseUrl)
								setError(next.error ?? null)
							}}
						/>
						{vault.configured ? (
							<TableRow
								label="Remove API key"
								subLabel="Deletes it from this device. Nothing can call out until you set one again."
								icon={rowIcon('TrashIcon', 'ic_trash_24px')}
								variant="danger"
								onPress={() => clearKey()}
							/>
						) : null}
					</TableRowGroup>

					{error ? (
						<Text color="text-feedback-critical" variant="text-sm/normal">
							{error}
						</Text>
					) : null}

					{vault.vaultError ? (
						<Text color="text-feedback-critical" variant="text-sm/normal">
							{vault.vaultError}
						</Text>
					) : null}

					{mismatch ? (
						<Text color="text-feedback-warning" variant="text-sm/normal">
							Your key is bound to {hostOf(vault.endpoint)} and is still sent
							only there. To use {hostOf(s.baseUrl)} instead, replace the key.
							A key can never follow a changed URL on its own, or any plugin
							could redirect it.
						</Text>
					) : null}

					{/*
					 * Bare fields in the Stack, not boxed inside a TableRowGroup: a lone input
					 * in a row group reads as a row that lost its row
					 * (docs/plugin-design-language.md §3.2).
					 */}
					<Text color="text-muted" variant="text-sm/semibold">
						Endpoint
					</Text>

					<TextInput
						label="Base URL"
						placeholder={DEFAULTS.baseUrl}
						description="Any OpenAI-compatible endpoint: DeepSeek, OpenRouter, Groq, or your own. Must be https://, except to this device or your local network. Takes effect when you next set the key."
						value={s.baseUrl}
						returnKeyType="done"
						onChange={value => set({ baseUrl: value.trim() })}
					/>

					<TextInput
						label="Model"
						placeholder={DEFAULTS.model}
						description="Whatever the endpoint calls it, like deepseek-chat."
						value={s.model}
						returnKeyType="done"
						onChange={value => set({ model: value.trim() })}
					/>

					<TextInput
						label="Give up after"
						placeholder={`${DEFAULTS.timeoutMs}`}
						description="A call that has not answered by then is abandoned. Plugins carry on without an answer, so a slow network never blocks anything. Catch Up and TL;DR ask for longer, since a summary takes a while."
						value={`${s.timeoutMs}`}
						trailingText="ms"
						returnKeyType="done"
						onChange={value => {
							const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
							set({
								timeoutMs:
									Number.isFinite(parsed) && parsed >= 500 ? parsed : DEFAULTS.timeoutMs,
							})
						}}
					/>

					<Text color="text-muted" variant="text-sm/normal">
						Changing the endpoint does not migrate anything. Each plugin decides
						for itself what it sends, so read that plugin's own privacy note
						before pointing this somewhere new.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
