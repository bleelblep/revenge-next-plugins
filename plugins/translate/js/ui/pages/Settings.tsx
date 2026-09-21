import { DEFAULTS } from '../../defaults'
import { describeCode } from '../../lib/languages'
import { providerById } from '../../lib/providers'
import { sweepNow } from '../../patches/autoTranslate'
import { rowIcon } from '../icon'
import {
	APPEARANCE_ROUTE,
	DEBUG_ROUTE,
	LANGUAGE_ROUTE,
	SERVICE_ROUTE,
} from '../routes'
import { useBottomPadding } from '../safeArea'
import type { TranslateStorage } from '../../types'

/**
 * The root page.
 *
 * The two choices people actually come here to make -- which language, and whether to translate
 * automatically -- are on this page, each one tap away. Everything about how a translation looks
 * is a level down, because it is set once and forgotten.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<TranslateStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TableSwitchRow } =
		revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<TranslateStorage>) => api.jsonStorage.set(patch)

	const serviceLabel =
		s.provider === 'auto'
			? 'Automatic — tries each until one answers'
			: `${providerById(s.provider)?.name ?? s.provider}, then the others if it fails`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Long-press a message, tap Translate
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								The message is translated where it sits, and only for you —
								nothing is sent to Discord. Long-press it again to put the
								original back.
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="Translate into"
							subLabel={describeCode(s.target)}
							icon={rowIcon('GlobeEarthIcon')}
							arrow
							onPress={() => navigation.navigate(LANGUAGE_ROUTE)}
						/>
						<TableRow
							label="Service"
							subLabel={serviceLabel}
							icon={rowIcon('LinkIcon', 'ic_link')}
							arrow
							onPress={() => navigation.navigate(SERVICE_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Translate automatically"
							subLabel={`Every message that isn't already in ${describeCode(s.target)} is translated as it arrives. Ones that clearly are get skipped on your phone, so they cost nothing.`}
							icon={rowIcon('RetryIcon', 'RefreshIcon')}
							value={!!s.autoTranslate}
							onValueChange={value => {
								set({ autoTranslate: value })
								if (value) sweepNow()
							}}
						/>
						<TableRow
							label="Appearance"
							subLabel="The Translated label, the blue highlight, and what the label says"
							icon={rowIcon('PaintPaletteIcon')}
							arrow
							onPress={() => navigation.navigate(APPEARANCE_ROUTE)}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						No key, no account and no AI. Only MyMemory is an official public
						API; Google, Bing and Yandex are used the way their own websites use
						them, which is against their terms and can stop working without
						warning. That is why there are four, and why a broken one is skipped
						automatically.
					</Text>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Which service answered, and what is being skipped"
							icon={rowIcon('BugIcon', 'ic_debug')}
							arrow
							onPress={() => navigation.navigate(DEBUG_ROUTE)}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
