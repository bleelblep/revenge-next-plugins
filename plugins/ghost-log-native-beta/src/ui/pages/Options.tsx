import { callNativeMethod } from '../../lib/native'
import { DEFAULTS } from '../../defaults'
import { getSettingsStorage, useLog } from '../state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { GhostLogSettings } from '../../types'

const ID = 'bleelblep.ghost-log-native-beta'

export default function Options() {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow, TableRadioGroup, TableRadioRow } = revenge.discord.design.Design

	const storage = getSettingsStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const count = useLog().length
	const set = (patch: Partial<GhostLogSettings>) => storage?.set(patch)

	const syncLimits = (maxEntries: number, unlimitedEntries: boolean) => {
		void callNativeMethod(`${ID}.setLimits`, [maxEntries, unlimitedEntries]).catch(() => {})
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Logging" hasIcons>
						<TableSwitchRow
							label="Log deletions"
							subLabel="Save deleted message text to the encrypted native log."
							icon={rowIcon('PencilIcon', 'ic_edit')}
							value={!!s.logDeletions}
							onValueChange={v => set({ logDeletions: v })}
						/>
						<TableSwitchRow
							label="Save embeds and attachments"
							subLabel="Keep rich message content in separate rotating files instead of the main text log."
							icon={rowIcon('ImageIcon', 'PaperclipIcon', 'ic_image')}
							value={!!s.saveEmbeds}
							onValueChange={v => set({ saveEmbeds: v })}
						/>
						<TableRadioGroup
							label="Rich content file size"
							value={String(s.embedsPerFile)}
							onValueChange={v => set({ embedsPerFile: Number(v) === 50 ? 50 : 100 })}
						>
							<TableRadioRow label="50 records per file" value="50" />
							<TableRadioRow label="100 records per file" value="100" />
						</TableRadioGroup>
						<TableSwitchRow
							label="Ignore bots"
							subLabel="Don't capture deleted messages from bot accounts."
							icon={rowIcon('BotIcon', 'ClydeIcon', 'RobotIcon', 'UserIcon')}
							value={!!s.ignoreBots}
							onValueChange={v => set({ ignoreBots: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Notifications" hasIcons>
						<TableSwitchRow
							label="Toast when caught"
							subLabel="Show a toast the moment a deletion is detected."
							icon={rowIcon('BellIcon', 'ic_notification')}
							value={!!s.toastOnCatch}
							onValueChange={v => set({ toastOnCatch: v })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Limits" hasIcons>
						<TableSwitchRow
							label="Encrypted auto backup"
							subLabel={
								s.autoBackupEnabled
									? 'On - each new catch also updates the encrypted backup file.'
									: 'Off - deleted messages stay in the on-device log only.'
							}
							icon={rowIcon('LockIcon', 'ic_lock')}
							value={!!s.autoBackupEnabled}
							onValueChange={v => {
								void set({ autoBackupEnabled: v })
								if (v && count > 0) {
									void callNativeMethod(`${ID}.exportBackup`, [s.backupFilePath || DEFAULT_BACKUP_PATH])
								}
							}}
						/>
						<TableSwitchRow
							label="Unlimited entries"
							subLabel={
								s.unlimitedEntries
									? 'Keeping every caught message.'
									: `Off - only the newest ${s.maxEntries ?? DEFAULTS.maxEntries} entries are kept, oldest are dropped when full.`
							}
							icon={rowIcon('InfinityIcon', 'ListBulletsIcon', 'ListViewIcon')}
							value={!!s.unlimitedEntries}
							onValueChange={v => {
								set({ unlimitedEntries: v })
								syncLimits(s.maxEntries ?? DEFAULTS.maxEntries, v)
							}}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
