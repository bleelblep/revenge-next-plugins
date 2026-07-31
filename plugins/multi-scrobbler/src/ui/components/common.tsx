import type { ReactNode } from "react"
import { setSettings } from "../../lib/state"
import type { LFMSettings } from "../../types"

/** Page + ScrollView + Stack, the container every settings screen in this plugin uses. */
export function SettingsPage({ children }: { children: ReactNode }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack } = revenge.discord.design.Design

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>{children}</Stack>
			</ScrollView>
		</Page>
	)
}

/** A text field bound straight to one settings key. */
export function SettingsTextInput({
	label,
	settingsKey,
	value,
	placeholder,
	secure = false,
}: {
	label: string
	settingsKey: keyof LFMSettings
	value: string | number
	placeholder?: string
	secure?: boolean
}) {
	const { TextInput } = revenge.discord.design.Design

	return (
		<TextInput
			label={label}
			value={String(value ?? "")}
			placeholder={placeholder}
			secureTextEntry={secure}
			onChange={(next: string) => setSettings({ [settingsKey]: next } as Partial<LFMSettings>)}
		/>
	)
}
