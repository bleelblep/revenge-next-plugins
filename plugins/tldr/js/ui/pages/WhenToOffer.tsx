import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { useBottomPadding } from '../safeArea'
import type { TldrStorage } from '../../types'

/**
 * The one number worth setting. A bare field in the `Stack`, the way Translate's language search
 * is -- a lone input boxed inside a `TableRowGroup` reads as a row that lost its row
 * (docs/plugin-design-language.md §3.2).
 */
export default function WhenToOffer() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TextInput } = revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (value: Partial<TldrStorage>) => storage?.set(value)

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TextInput
						label="Only offer TL;DR on messages longer than"
						placeholder={`${DEFAULTS.minLength}`}
						description="Shorter messages don't get the row at all, so the menu stays short."
						value={`${s.minLength}`}
						trailingText="characters"
						returnKeyType="done"
						onChange={value => {
							const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
							set({
								minLength: Number.isFinite(parsed) ? parsed : DEFAULTS.minLength,
							})
						}}
					/>

					<Text color="text-muted" variant="text-sm/normal">
						Link previews and embed text count towards the length, so a short message
						with a long preview still gets the row. The default, {DEFAULTS.minLength}{' '}
						characters, is about a long paragraph.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
