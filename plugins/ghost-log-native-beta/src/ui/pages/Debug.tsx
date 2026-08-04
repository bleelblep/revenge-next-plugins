import { DEFAULT_BACKUP_PATH, DEFAULTS } from '../../defaults'
import { fillWithFakeEntries } from '../../lib/debug'
import { dumpMessageStore, inspectCurrentChannel, inspectMessageInstance, startMessageLoadProbe, watchGetMessages } from '../../lib/probe'
import { getSettingsStorage } from '../state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { GhostLogSettings } from '../../types'

let stopProbe: (() => void) | undefined
let stopGetMessages: (() => void) | undefined

export default function Debug() {
	const { Page } = revenge.components
	const { React } = revenge.react
	const { ScrollView, Alert } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = revenge.discord.design.Design

	const storage = getSettingsStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (patch: Partial<GhostLogSettings>) => storage?.set(patch)

	const [probing, setProbing] = React.useState(!!stopProbe)
	const [watching, setWatching] = React.useState(!!stopGetMessages)
	const backupPath = s.backupFilePath?.trim() || DEFAULT_BACKUP_PATH

	const toast = (content: string) =>
		revenge.discord.actions.ToastActionCreators.open({ key: 'ghost-log-native-beta-debug', content })

	const seedFake = () => {
		Alert.alert(
			'Fill with fake deleted messages',
			'Add 200 fake entries across fake servers, users and channels. For UI testing.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Fill 200',
					onPress: () => {
						void (async () => {
							const added = await fillWithFakeEntries(200)
							toast(`Added ${added} fake deleted messages.`)
						})()
					},
				},
			],
		)
	}

	const toggleProbe = (on: boolean) => {
		if (on && !stopProbe) {
			stopProbe = startMessageLoadProbe()
			toast('Probe on — switch channels, then check logcat.')
		} else if (!on && stopProbe) {
			stopProbe()
			stopProbe = undefined
			toast('Probe off.')
		}
		setProbing(!!stopProbe)
	}

	const toggleGetMessages = (on: boolean) => {
		if (on && !stopGetMessages) {
			stopGetMessages = watchGetMessages()
			toast('Watching getMessages — open a channel, then check logcat.')
		} else if (!on && stopGetMessages) {
			stopGetMessages()
			stopGetMessages = undefined
			toast('getMessages watch off.')
		}
		setWatching(!!stopGetMessages)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Testing" hasIcons>
						<TableSwitchRow
							label="Count my own messages"
							subLabel="For testing only: lets you delete your own message and verify capture."
							icon={rowIcon('UserIcon')}
							value={!!s.countOwnMessages}
							onValueChange={v => set({ countOwnMessages: v })}
						/>
						<TableRow
							label="Fill log with 200 fake entries"
							subLabel="For UI testing: multiple servers, users, channels and attachments. Adds to the current log."
							icon={rowIcon('BugIcon', 'ic_debug')}
							onPress={seedFake}
						/>
						<TableRow
							label="Backup target path"
							subLabel={backupPath}
							icon={rowIcon('PinIcon', 'ic_pin')}
						/>
					</TableRowGroup>

					<TableRowGroup title="Restore research" hasIcons>
						<TableSwitchRow
							label="Message-load probe"
							subLabel="Logs message/channel-load events and the channel's MessageStore shape to logcat. Shapes and counts only."
							icon={rowIcon('SearchIcon', 'MagnifyingGlassIcon', 'ic_search')}
							value={probing}
							onValueChange={toggleProbe}
						/>
						<TableSwitchRow
							label="Watch getMessages"
							subLabel="Logs what getMessages returns when a channel renders — the render-layer injection point."
							icon={rowIcon('EyeIcon')}
							value={watching}
							onValueChange={toggleGetMessages}
						/>
						<TableRow
							label="Inspect current channel"
							subLabel="Dump the open channel's cached MessageStore structure to logcat."
							icon={rowIcon('ListIcon', 'ic_list')}
							onPress={() => toast(inspectCurrentChannel())}
						/>
						<TableRow
							label="Dump MessageStore methods"
							subLabel="Lists every method/property on MessageStore to logcat."
							icon={rowIcon('ListBulletsIcon', 'ic_list')}
							onPress={() => toast(dumpMessageStore())}
						/>
						<TableRow
							label="Inspect a real message"
							subLabel="Logs a real message's constructor, field types, and methods."
							icon={rowIcon('SearchIcon', 'ic_search')}
							onPress={() => toast(inspectMessageInstance())}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
