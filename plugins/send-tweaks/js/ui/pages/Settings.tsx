import { DEFAULTS } from '../../defaults'
import { rowIcon } from '../icon'
import { DEBUG_ROUTE, RULES_ROUTE, TRY_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'

/**
 * The root page. Each tweak is one switch with a plain sentence under it; the only sub-page a
 * normal user needs is the rules list, because that is the only tweak with anything to configure.
 */
export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<SendTweaksStorage>
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
	const set = (patch: Partial<SendTweaksStorage>) => api.jsonStorage.set(patch)

	const activeRules = s.rules.filter(rule => rule.enabled && rule.find).length
	const rulesLabel = !s.rules.length
		? 'No rules yet'
		: `${activeRules} of ${s.rules.length} rule${s.rules.length === 1 ? '' : 's'} on`

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<Card variant="secondary" border="none">
						<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
							<Text color="text-default" variant="text-md/semibold">
								Small fixes to what you send
							</Text>
							<Text
								color="text-muted"
								variant="text-sm/normal"
								style={{ marginTop: 8 }}
							>
								Everything here happens on your phone, just before a message
								leaves. Text inside code blocks is never changed, so a link or
								command you are quoting stays exactly as you wrote it.
							</Text>
						</View>
					</Card>

					<TableRowGroup title="Links" hasIcons>
						<TableSwitchRow
							label="Remove tracking from links"
							subLabel="Strips things like ?si=, utm_source and fbclid that tell a site who shared the link and where. The link still goes to the same place."
							icon={rowIcon('LinkIcon', 'ic_link')}
							value={!!s.cleanUrls}
							onValueChange={value => set({ cleanUrls: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Replies" hasIcons>
						<TableSwitchRow
							label="Don't ping when replying"
							subLabel="Replies start with the @ mention switched off. Tap @ above the chat box to turn it on for one reply."
							icon={rowIcon('ArrowAngleLeftUpIcon')}
							value={!!s.noReplyMention}
							onValueChange={value => set({ noReplyMention: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Text replacement" hasIcons>
						<TableSwitchRow
							label="Replace text as you send"
							subLabel="Your own find-and-replace rules, like fixing a word you always mistype or turning -> into →."
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={!!s.textReplace}
							onValueChange={value => set({ textReplace: value })}
						/>
						<TableRow
							label="Rules"
							subLabel={rulesLabel}
							icon={rowIcon('SettingsIcon', 'ic_settings')}
							arrow
							onPress={() => navigation.navigate(RULES_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup hasIcons>
						<TableSwitchRow
							label="Also apply when editing"
							subLabel="Clean links and apply your rules to messages you edit, not just new ones. The edit box opens already cleaned, so saving without changes still fixes an old message."
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={!!s.applyToEdits}
							onValueChange={value => set({ applyToEdits: value })}
						/>
						<TableRow
							label="Try a message"
							subLabel="Type something and see exactly what would be sent"
							icon={rowIcon('ChatIcon', 'ic_message')}
							arrow
							onPress={() => navigation.navigate(TRY_ROUTE)}
						/>
					</TableRowGroup>

					<TableRowGroup title="Developer" hasIcons>
						<TableRow
							label="Debug"
							subLabel="Whether the hooks installed, and what they have changed"
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
