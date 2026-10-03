import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import {
	clearKey,
	describeBalance,
	promptForKey,
	useBalance,
	useVaultStatus,
} from '../../lib/vault'
import { CUSTOM, PROVIDERS, providerFor } from '../../lib/providers'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import { confirmDestructive } from '../../../../../shared/ui/confirm'
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
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TextInput,
		TableRadioGroup,
		TableRadioRow,
	} = revenge.discord.design.Design as any

	// A plain navigator route, so there is no plugin `api` prop here.
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<AiCoreStorage>) => storage?.set(patch)
	const vault = useVaultStatus()
	const { balance, refresh: refreshBalance } = useBalance()
	const [error, setError] = React.useState<string | null>(null)
	// Custom is remembered here so picking it keeps showing the URL field even while the URL still
	// belongs to one of the listed providers.
	const [picked, setPicked] = React.useState<string>(() =>
		providerFor(s.baseUrl),
	)
	const selected = picked === CUSTOM ? CUSTOM : providerFor(s.baseUrl)
	const pick = (id: string) => {
		setPicked(id)
		const preset = PROVIDERS.find(p => p.id === id)
		if (preset) set({ baseUrl: preset.baseUrl, model: preset.model })
	}
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
					<TableRadioGroup
						title="Provider"
						description="Pick where AI Core sends requests, then set that provider's API key below."
						defaultValue={selected}
						onChange={(id: string) => pick(id)}
					>
						{PROVIDERS.map(p => (
							<TableRadioRow
								key={p.id}
								label={p.label}
								subLabel={`Keys at ${p.keysAt}`}
								value={p.id}
							/>
						))}
						<TableRadioRow
							label="Custom"
							subLabel="Any other OpenAI-compatible endpoint, like Groq or your own server"
							value={CUSTOM}
						/>
					</TableRadioGroup>

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
								label="Balance"
								subLabel={describeBalance(balance)}
								icon={rowIcon('CreditCardIcon')}
								onPress={balance?.supported ? refreshBalance : undefined}
							/>
						) : null}
						{vault.configured ? (
							<TableRow
								label="Remove API key"
								subLabel="Deletes it from this device. Nothing can call out until you set one again."
								icon={dangerIcon('TrashIcon', 'ic_trash_24px')}
								variant="danger"
								onPress={() =>
									confirmDestructive({
										title: 'Remove the API key?',
										body: 'It is deleted from this device. Plugins that use AI stop working until you set a key again.',
										action: 'Remove',
										onConfirm: () => clearKey(),
									})
								}
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
							only there. To use {hostOf(s.baseUrl)} instead, replace the key. A
							key can never follow a changed URL on its own, or any plugin could
							redirect it.
						</Text>
					) : null}

					<TableRowGroup title="Endpoint">
						{selected === CUSTOM ? (
							<FieldRow
								label="Base URL"
								description="Any OpenAI-compatible endpoint: Groq, a local server, or anything else that speaks the OpenAI chat format. Must be https://, except to this device or your local network. Takes effect when you next set the key."
							>
								<TextInput
									placeholder={DEFAULTS.baseUrl}
									value={s.baseUrl}
									returnKeyType="done"
									onChange={(value: string) => set({ baseUrl: value.trim() })}
								/>
							</FieldRow>
						) : null}

						<FieldRow
							label="Model"
							description="Filled in when you pick a provider; change it to use another of that provider's models."
						>
							<TextInput
								placeholder={DEFAULTS.model}
								value={s.model}
								returnKeyType="done"
								onChange={(value: string) => set({ model: value.trim() })}
							/>
						</FieldRow>

						<FieldRow
							label="Give up after"
							description="A call that has not answered by then is abandoned. Plugins carry on without an answer, so a slow network never blocks anything. Catch Up and TL;DR ask for longer, since a summary takes a while."
						>
							<TextInput
								placeholder={`${DEFAULTS.timeoutMs}`}
								value={`${s.timeoutMs}`}
								trailingText="ms"
								returnKeyType="done"
								onChange={(value: string) => {
									const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
									set({
										timeoutMs:
											Number.isFinite(parsed) && parsed >= 500
												? parsed
												: DEFAULTS.timeoutMs,
									})
								}}
							/>
						</FieldRow>
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
