import { DEFAULTS } from '../../defaults'
import { LANGUAGES, languageFor } from '../../lib/languages'
import { getStorage } from '../../lib/state'
import { repaintShowing } from '../../lib/translate'
import { resetTranslations, showingIds } from '../../lib/translations'
import { sweepNow } from '../../patches/autoTranslate'
import { useBottomPadding } from '../safeArea'

/**
 * The language picker.
 *
 * A searchable radio list rather than a text field: nobody should need to know that Chinese is
 * `zh-CN` to pick it. Searching matches the English name, the language's own name and the code,
 * so "japan", "日本" and "ja" all find the same row.
 *
 * Choosing one goes straight back, like Discord's own language setting.
 */
export default function Language() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const React = revenge.react.React
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRadioGroup,
		TableRadioRow,
		TextInput,
	} = revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { goBack: () => void }
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	const [query, setQuery] = React.useState('')
	const [custom, setCustom] = React.useState(
		languageFor(s.target) ? '' : s.target,
	)

	const choose = (code: string) => {
		if (!code || code === s.target) return
		storage?.set({ target: code })
		// Translations are into the old language, so they are dropped and fetched again on
		// demand. The ids on screen are taken *first*: once cleared there is nothing left to
		// say which rows need putting back.
		const onScreen = showingIds()
		resetTranslations()
		repaintShowing(onScreen)
		if (s.autoTranslate) sweepNow()
	}

	const needle = query.trim().toLowerCase()
	const matches = needle
		? LANGUAGES.filter(
				language =>
					language.name.toLowerCase().includes(needle) ||
					language.native.toLowerCase().includes(needle) ||
					language.code.toLowerCase().startsWith(needle),
			)
		: LANGUAGES

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<TextInput
						placeholder="Search languages"
						value={query}
						isClearable
						onChange={setQuery}
					/>

					{matches.length ? (
						<TableRowGroup>
							{/*
							 * `key` changes with the search so the uncontrolled radio group remounts and
							 * shows the right selection for whatever rows are visible now.
							 */}
							<TableRadioGroup
								key={`${needle}|${s.target}`}
								defaultValue={s.target}
								onChange={(code: string) => {
									choose(code)
									navigation.goBack()
								}}
							>
								{matches.map(language => (
									<TableRadioRow
										key={language.code}
										label={language.name}
										subLabel={
											language.native === language.name
												? language.code
												: `${language.native} · ${language.code}`
										}
										value={language.code}
									/>
								))}
							</TableRadioGroup>
						</TableRowGroup>
					) : (
						<Text color="text-muted" variant="text-sm/normal">
							Nothing matches "{query}". If you know its code, enter it below.
						</Text>
					)}

					<TableRowGroup title="Not listed?">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<TextInput
								label="Language code"
								placeholder="e.g. eu, haw, pt-BR"
								description="Any code the services accept. It is used as soon as you type it."
								value={custom}
								isClearable
								onChange={value => {
									const code = value.trim()
									setCustom(code)
									if (code.length >= 2) choose(code)
								}}
							/>
						</View>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
