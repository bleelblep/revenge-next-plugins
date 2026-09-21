import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { repaintShowing } from '../../lib/translate'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { TranslateStorage } from '../../types'

/**
 * How a translated message looks.
 *
 * Every switch here repaints the translations already on screen, so the effect is visible as soon
 * as it is flipped rather than on the next translation.
 */
export default function Appearance() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableSwitchRow } =
		revenge.discord.design.Design

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<TranslateStorage>) => {
		storage?.set(patch)
		repaintShowing()
	}

	const labelOn = s.markTranslated || s.showDetected || s.showProvider

	// A live preview of the label, built the same way the row hook builds it.
	const parts: string[] = []
	if (s.markTranslated) parts.push('🌐 Translated')
	if (s.showDetected) parts.push('from Spanish')
	if (s.showProvider) parts.push('Google')
	const preview = parts.length
		? `${s.markTranslated ? '' : '🌐 '}${parts.join(' · ')}`
		: 'No label'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Marking translated messages" hasIcons>
						<TableSwitchRow
							label="Blue highlight"
							subLabel="A blue background and bar down the left, like a mention but blue. A message that is already highlighted keeps its own."
							icon={rowIcon('PaintPaletteIcon')}
							value={!!s.highlightTranslated}
							onValueChange={value => set({ highlightTranslated: value })}
						/>
						<TableSwitchRow
							label="Translated label"
							subLabel="A small 🌐 Translated line under the message, so it is never mistaken for what was actually written."
							icon={rowIcon('GlobeEarthIcon')}
							value={!!s.markTranslated}
							onValueChange={value => set({ markTranslated: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Extra detail on the label" hasIcons>
						<TableSwitchRow
							label="Original language"
							subLabel="Adds where it was translated from, when the service says."
							icon={rowIcon('ChatIcon', 'ic_message')}
							value={!!s.showDetected}
							onValueChange={value => set({ showDetected: value })}
						/>
						<TableSwitchRow
							label="Which service"
							subLabel="Adds the service that answered. Handy for comparing them; noise after that."
							icon={rowIcon('LinkIcon', 'ic_link')}
							value={!!s.showProvider}
							onValueChange={value => set({ showProvider: value })}
						/>
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						{labelOn
							? `The label will read: ${preview}`
							: 'No label will be shown.'}
					</Text>

					<TableRowGroup title="Behaviour" hasIcons>
						<TableSwitchRow
							label="Skip messages already in your language"
							subLabel="Shows a short notice instead of a pointless translation."
							icon={rowIcon('CircleCheckIcon', 'ic_check')}
							value={!!s.skipSameLanguage}
							onValueChange={value => set({ skipSameLanguage: value })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
