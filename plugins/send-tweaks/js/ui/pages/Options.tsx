import { updateClearUrls } from '../../lib/clearurls'
import { getStorage, useSettings } from '../../lib/state'

function toast(content: string) {
	try {
		revenge.discord.actions.ToastActionCreators.open({ key: 'SendTweaksClearUrls', content })
	} catch {
		/* a toast is not worth a crash */
	}
}
import { rowIcon } from '../icon'
import { SEND_BUTTON_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'

/**
 * Every switch, grouped by what it changes -- Ghost Log Native Beta's `Options.tsx` layout. The rule
 * lists and tools stay on the root index; this page is behaviour toggles only.
 */
export default function Options() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design
	const { useNavigation } = revenge.externals.ReactNavigation.ReactNavigationNative
	const navigation = useNavigation() as { navigate: (route: string) => void }

	const storage = getStorage()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)

	const [updating, setUpdating] = React.useState(false)
	const runUpdate = () => {
		setUpdating(true)
		updateClearUrls()
			.then(result =>
				toast(
					result.ok
						? `ClearURLs rules updated: ${result.count} sites`
						: `Couldn't update the ClearURLs rules (${result.error}). The old ones still apply.`,
				),
			)
			.finally(() => setUpdating(false))
	}
	const data = s.clearUrlsData
	const clearUrlsLine = data
		? `Community rules for ${data.providers.length} sites, on top of the built-in list. Updated ${new Date(data.updatedAt).toLocaleDateString()}.`
		: 'Adds the ClearURLs community rules for about 200 sites, and turns redirect links like google.com/url into where they really go. Downloads when first used.'

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Sending" hasIcons>
						<TableSwitchRow
							label="Silent messages"
							subLabel={
								s.silentMessages
									? "On - everything you send goes out as @silent. It still arrives, but nobody gets a notification."
									: "Send every message as @silent, so it arrives without notifying anyone. Same as typing @silent yourself."
							}
							icon={rowIcon('BellSlashIcon', 'BellZIcon')}
							value={!!s.silentMessages}
							onValueChange={value => set({ silentMessages: value })}
						/>
						<TableRow
							label="Send button"
							subLabel={
								!s.sendButtonSheet
									? 'Holding send does nothing'
									: s.sendButtonMode === 'swipe'
										? 'Hold and swipe up to send unchanged'
										: 'Hold for the menu'
							}
							icon={rowIcon('SendMessageIcon', 'ic_send')}
							arrow
							onPress={() => navigation.navigate(SEND_BUTTON_ROUTE)}
						/>
						<TableSwitchRow
							label="Also apply when editing"
							subLabel="Clean links and apply your rules to messages you edit, not just new ones. The edit box opens already cleaned, so saving without changes still fixes an old message."
							icon={rowIcon('PencilIcon', 'ic_edit_24px')}
							value={!!s.applyToEdits}
							onValueChange={value => set({ applyToEdits: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Links" hasIcons>
						<TableSwitchRow
							label="Remove tracking from links"
							subLabel="Strips things like ?si=, utm_source and fbclid that tell a site who shared the link and where. The link still goes to the same place."
							icon={rowIcon('ShieldIcon', 'LinkIcon')}
							value={!!s.cleanUrls}
							onValueChange={value => set({ cleanUrls: value })}
						/>
						<TableSwitchRow
							label="Use ClearURLs rules"
							subLabel={clearUrlsLine}
							icon={rowIcon('DownloadIcon', 'ic_download_24px')}
							disabled={!s.cleanUrls}
							value={!!s.clearUrlsRules}
							onValueChange={value => {
								set({ clearUrlsRules: value })
								if (value && !s.clearUrlsData) runUpdate()
							}}
						/>
						<TableRow
							label={updating ? 'Updating ClearURLs rules…' : 'Update ClearURLs rules now'}
							subLabel="They also update themselves about once a week."
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							disabled={!s.cleanUrls || !s.clearUrlsRules || updating}
							onPress={runUpdate}
						/>
						<TableSwitchRow
							label="Rewrite links"
							subLabel="Your own link rules, like twitter.com to fxtwitter.com so they embed properly."
							icon={rowIcon('LinkIcon', 'ic_link')}
							value={!!s.linkRewrite}
							onValueChange={value => set({ linkRewrite: value })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Text" hasIcons>
						<TableSwitchRow
							label="Replace text as you send"
							subLabel="Your own find-and-replace rules, like fixing a word you always mistype or turning -> into →."
							icon={rowIcon('TextIcon', 'ic_edit_24px')}
							value={!!s.textReplace}
							onValueChange={value => set({ textReplace: value })}
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
				</Stack>
			</ScrollView>
		</Page>
	)
}
