import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { useBottomPadding } from '../safeArea'
import type { AiCoreStorage } from '../../types'

/** Endpoint credentials and model choice. Nothing here is per-plugin. */
export default function Provider() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TextInput } =
		revenge.discord.design.Design

	// A plain navigator route, so there is no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Credentials">
						<View
							style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
						>
							<TextInput
								label="API key"
								placeholder="sk-..."
								description="Stored in plain text, readable by any other plugin. Use a key you can revoke."
								value={s.apiKey}
								secureTextEntry
								isClearable
								onChange={value => set({ apiKey: value.trim() })}
							/>
						</View>
					</TableRowGroup>

					<TableRowGroup title="Endpoint">
						<View
							style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 12 }}
						>
							<TextInput
								label="Base URL"
								placeholder={DEFAULTS.baseUrl}
								description="Any OpenAI-compatible endpoint: DeepSeek, OpenRouter, Groq, or your own."
								value={s.baseUrl}
								onChange={value => set({ baseUrl: value.trim() })}
							/>
							<TextInput
								label="Model"
								placeholder={DEFAULTS.model}
								value={s.model}
								onChange={value => set({ model: value.trim() })}
							/>
							<TextInput
								label="Timeout (ms)"
								placeholder={`${DEFAULTS.timeoutMs}`}
								description="A call that has not answered by then is abandoned. Plugins are expected to carry on without an answer, so a slow network never blocks anything."
								value={`${s.timeoutMs}`}
								onChange={value => {
									const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
									set({
										timeoutMs:
											Number.isFinite(parsed) && parsed >= 500
												? parsed
												: DEFAULTS.timeoutMs,
									})
								}}
							/>
						</View>
					</TableRowGroup>

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
