import { clearEdits, type EditRecord, refreshEdits, useEdits } from '../../lib/edits'
import { jumpToDeletedMessage } from '../../lib/navigate'
import Avatar from '../components/Avatar'
import Pager from '../components/Pager'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import { groupHeaderText } from '../theme'

function ago(timestamp: number): string {
	const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
	if (seconds < 60) return 'just now'
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
	return `${Math.floor(seconds / 86400)}d ago`
}

const clip = (text: string, max: number) => {
	const flat = text.replace(/\s+/g, ' ').trim()
	if (!flat) return '(no text)'
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function groupByOrigin(records: EditRecord[]) {
	const groups = new Map<string, { label: string; icon?: string; id?: string; items: EditRecord[] }>()
	for (const record of records) {
		const key = record.guildId ?? '@me'
		const existing = groups.get(key)
		if (existing) existing.items.push(record)
		else {
			groups.set(key, {
				label: record.guildName ?? 'Direct messages',
				icon: record.guildIcon,
				id: record.guildId,
				items: [record],
			})
		}
	}
	return [...groups.values()]
}

/**
 * Every edited message caught, grouped by server like Deleted messages. A row shows the message as
 * it is now and the version before it; tapping it opens the full history underneath, with a row to
 * jump to the message.
 */
export default function Edits() {
	const { Page } = revenge.components
	const { React } = revenge.react
	const { ScrollView, View, Text, Alert } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	const records = useEdits()
	const bottomPadding = useBottomPadding()
	const [open, setOpen] = React.useState<string | undefined>()

	const pageSize = 50
	const totalPages = Math.max(1, Math.ceil(records.length / pageSize))
	const [page, setPage] = React.useState(1)
	const safePage = Math.min(Math.max(1, page), totalPages)
	const grouped = groupByOrigin(records.slice((safePage - 1) * pageSize, safePage * pageSize))

	const confirmClear = () => {
		Alert.alert('Clear edit history', `Remove the history of all ${records.length} edited messages?`, [
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Clear', style: 'destructive', onPress: () => void clearEdits() },
		])
	}

	if (!records.length) {
		return (
			<Page>
				<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
					<TableRowGroup title="Nothing caught yet">
						<TableRow
							label="No edited messages"
							subLabel="When someone edits a message Discord had loaded, the earlier version is kept here."
						/>
						<TableRow
							label="Refresh"
							subLabel="Re-read the native edit log."
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={() => void refreshEdits()}
						/>
					</TableRowGroup>
				</ScrollView>
			</Page>
		)
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottomPadding }}>
				<Stack spacing={24}>
					{totalPages > 1 ? <Pager page={safePage} totalPages={totalPages} onChange={setPage} /> : null}

					{grouped.map(group => (
						<View key={group.id ?? '@me'}>
							<View
								style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 }}
							>
								<Avatar kind="guild" id={group.id} hash={group.icon} name={group.label} size={20} />
								<Text style={{ color: groupHeaderText(), fontSize: 12, fontWeight: '600' }}>
									{group.label.toUpperCase()}
								</Text>
							</View>

							<TableRowGroup>
								{group.items.flatMap(record => {
									const count = record.versions.length
									const before = record.versions[count - 1]?.content ?? ''
									const expanded = open === record.id
									const rows = [
										<TableRow
											key={record.id}
											icon={
												<Avatar
													kind="user"
													id={record.authorId}
													hash={record.authorAvatar}
													name={record.authorName}
												/>
											}
											label={record.authorName}
											subLabel={`Now: ${clip(record.current, 200)}\nWas: ${clip(before, 200)}\n${record.channelName} · ${count} earlier version${count === 1 ? '' : 's'} · ${ago(record.editedAt)}`}
											arrow
											onPress={() => setOpen(expanded ? undefined : record.id)}
										/>,
									]
									if (expanded) {
										// Newest first, so the version just replaced sits next to the current one.
										record.versions
											.map((version, index) => ({ version, index }))
											.reverse()
											.forEach(({ version, index }) =>
												rows.push(
													<TableRow
														key={`${record.id}:${index}`}
														label={`Version ${index + 1} · replaced ${ago(version.editedAt)}`}
														subLabel={clip(version.content, 1000)}
													/>,
												),
											)
										rows.push(
											<TableRow
												key={`${record.id}:jump`}
												label="Jump to message"
												icon={rowIcon('ArrowSmallRightIcon', 'ChatIcon', 'ic_message')}
												arrow
												onPress={() => jumpToDeletedMessage(record)}
											/>,
										)
									}
									return rows
								})}
							</TableRowGroup>
						</View>
					))}

					<TableRowGroup title="Manage" hasIcons>
						<TableRow
							label="Refresh"
							subLabel={`${records.length} edited messages in the native log.`}
							icon={rowIcon('RefreshIcon', 'ic_refresh')}
							onPress={() => void refreshEdits()}
						/>
						<TableRow
							variant="danger"
							label="Clear edit history"
							subLabel={`Removes all ${records.length}. Deleted messages are not affected.`}
							icon={dangerIcon('TrashIcon', 'ic_trash')}
							onPress={confirmClear}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
