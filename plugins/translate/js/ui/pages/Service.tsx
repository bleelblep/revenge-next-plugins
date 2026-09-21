import { DEFAULTS } from '../../defaults'
import { PROVIDERS } from '../../lib/providers'
import { getStorage } from '../../lib/state'
import { useBottomPadding } from '../safeArea'
import type { TranslateStorage } from '../../types'

/**
 * Which service to ask first.
 *
 * Automatic is the first option and the default. Picking one only changes the *order*: a chosen
 * service that is down still falls through to the rest, because a plugin that stops working to
 * honour a setting is misreading the setting, not respecting it.
 */
export default function Service() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRadioGroup, TableRadioRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { goBack: () => void }
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup>
						<TableRadioGroup
							defaultValue={s.provider}
							onChange={(value: string) => {
								storage?.set({
									provider: value as TranslateStorage['provider'],
								})
								navigation.goBack()
							}}
						>
							<TableRadioRow
								label="Automatic"
								subLabel="Google, then Bing, then Yandex, then MyMemory — whichever answers first. Recommended."
								value="auto"
							/>
							{PROVIDERS.map(provider => (
								<TableRadioRow
									key={provider.id}
									label={provider.name}
									subLabel={provider.note}
									value={provider.id}
								/>
							))}
						</TableRadioGroup>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Picking a service only decides which is asked first. If it fails,
						the others are still tried, so a service going down never stops
						translation working. A service that fails is skipped for five
						minutes before being tried again.
					</Text>
				</Stack>
			</ScrollView>
		</Page>
	)
}
