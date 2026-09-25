import { copyText } from '../../lib/clipboard'
import { importRules, PRESETS, type Preset, THREAD } from '../../lib/importRules'
import { addRule, readRules, type RuleKind, useRules, writeRules } from '../../lib/ruleStore'
import AiDraft from '../components/AiDraft'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'

function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: 'SendTweaksReadyToast', content })
}

/**
 * Opens the thread inside Discord. `transitionTo` is Discord's in-app router; handing the
 * discord.com URL to Android instead does nothing visible in this repackaged app, which is not that
 * domain's link handler (ghost-log-native-beta `lib/navigate.ts` found this on-device).
 */
function openThread(): boolean {
	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const routing = lookupModule<any>(withProps('transitionToGuild'))?.[0]
		const host = typeof routing?.transitionTo === 'function' ? routing : routing?.default
		if (typeof host?.transitionTo !== 'function') return false
		host.transitionTo(`/channels/${THREAD.guildId}/${THREAD.channelId}`)
		return true
	} catch (error) {
		console.error('[SendTweaks] could not open the thread:', error)
		return false
	}
}

const SOURCE: Record<Preset['source'], string> = {
	thread: 'From the thread',
	updated: 'From the thread, updated',
	added: 'Added by Send Tweaks',
}

export function ReadyMadeLinks() {
	return <ReadyMade kind="links" />
}

export function ReadyMadeText() {
	return <ReadyMade kind="text" />
}

/**
 * Ready-made rules and importing for one list. There is one of these per list, each opened only
 * from its own list's screen, so link rules are only offered next to link rules and text rules next
 * to text rules, and the Import box always fills the list you came from.
 *
 * The rules come from the Text Replace thread in the Vendetta server -- see the note on `PRESETS`
 * for what was checked, changed and left out.
 */
function ReadyMade({ kind }: { kind: RuleKind }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, Card, TableRowGroup, TableRow, TextInput } = revenge.discord.design.Design

	const links = kind === 'links'
	const rules = useRules(kind)
	const presets = PRESETS.filter(preset => preset.kind === kind)
	const [pasted, setPasted] = React.useState('')
	const [skipped, setSkipped] = React.useState<string[]>([])

	const runImport = () => {
		const result = importRules(pasted)
		setSkipped(result.skipped)
		if (result.rules.length) {
			writeRules(kind, [...readRules(kind), ...result.rules])
			setPasted('')
		}
		showToast(
			result.rules.length
				? `Imported ${result.rules.length} rule${result.rules.length === 1 ? '' : 's'}${result.skipped.length ? `, skipped ${result.skipped.length}` : ''}.`
				: 'Nothing imported — see below.',
		)
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12, gap: 6 }}>
							<Text color="text-default" variant="text-md/semibold">
								From the Text Replace thread
							</Text>
							<Text color="text-muted" variant="text-sm/normal">
								{links
									? "These were shared in the Vendetta server's thread for Text Replace, a Vendetta and Bunny plugin. Some rules may not work correctly: the sites they point to can change or shut down at any time, so check a link after sending it."
									: "These were shared in the Vendetta server's thread for Text Replace, a Vendetta and Bunny plugin. Some rules may not work correctly, so try one in Try a message before relying on it."}
							</Text>
						</View>
					</Card>

					<TableRowGroup hasIcons>
						<TableRow
							label="Open the thread"
							subLabel="In the Vendetta server. You need to have joined it."
							icon={rowIcon('ChatIcon', 'ic_message')}
							arrow
							onPress={() => {
								if (!openThread()) {
									showToast(
										copyText(THREAD.url)
											? 'Could not open it here, so the link was copied.'
											: 'Could not open the thread.',
									)
								}
							}}
						/>
						<TableRow
							label="Copy the link"
							subLabel={THREAD.url}
							icon={rowIcon('LinkIcon', 'ic_link')}
							onPress={() => showToast(copyText(THREAD.url) ? 'Link copied.' : 'Could not reach the clipboard.')}
						/>
					</TableRowGroup>

					<AiDraft kind={kind} />

					<TableRowGroup title="Ready-made" hasIcons>
						{presets.map(preset => {
							const added = rules.some(rule => rule.find === preset.rule.find)
							return (
								<TableRow
									key={preset.rule.name}
									label={preset.rule.name ?? preset.rule.find}
									subLabel={`${added ? 'Added · ' : ''}${SOURCE[preset.source]}. ${preset.note}`}
									icon={
										added
											? rowIcon('CircleCheckIcon')
											: rowIcon('PlusSmallIcon', 'PlusLargeIcon', 'ic_add_24px')
									}
									disabled={added}
									onPress={() => {
										addRule(kind, { ...preset.rule })
										showToast(`Added “${preset.rule.name}”.`)
									}}
								/>
							)
						})}
					</TableRowGroup>

					<View style={{ gap: 8 }}>
						<TextInput
							label={links ? 'Import link rules' : 'Import rules'}
							placeholder='Paste a rule, e.g. { "name": …, "match": …, "replace": … }'
							description={`Text Replace's format: one rule, a list, or a whole message with \`\`\`json blocks in it. Goes into your ${links ? 'link rules' : 'replacement rules'}.`}
							value={pasted}
							multiline
							isClearable
							onChange={(value: string) => setPasted(value)}
						/>
						<TableRowGroup hasIcons>
							<TableRow
								label="Import"
								icon={rowIcon('DownloadIcon', 'ic_download_24px')}
								disabled={!pasted.trim()}
								onPress={runImport}
							/>
						</TableRowGroup>
						{skipped.length ? (
							<Text color="text-feedback-warning" variant="text-sm/normal">
								{`Not imported:\n${skipped.join('\n')}`}
							</Text>
						) : null}
					</View>
				</Stack>
			</ScrollView>
		</Page>
	)
}
