import { DEFAULTS } from '../../defaults'
import {
	discoveryAvailable,
	listInstalled,
	usesAiCore,
} from '../../lib/installed'
import { getStorage } from '../../lib/state'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { Installed } from '../../lib/installed'
import type { Entry } from '../../types'

/**
 * Choosing what the hub shows.
 *
 * Every installed plugin is a switch, grouped the way the hub groups them. Bleelblep's plugins can
 * be added or removed all at once. AI Core and the plugins that use it go on the AI Hub page, the
 * rest on the Hub. How the pages look -- favourites, their order, shortcuts in Discord's settings --
 * is on the Settings screen, not here.
 *
 * Without Developer Mode there is no list of installed plugins to show (see `lib/installed.ts`),
 * so the page says so plainly -- and still lists what is already in the hub, so removing things
 * never needs Developer Mode even though adding them does.
 */
export default function Manage() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const {
		Stack,
		Text,
		Card,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		AlertModal,
		AlertActionButton,
	} = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries: Entry[] = s.entries ?? []
	const pinned = new Set(entries.map(entry => entry.id))

	// Every write replaces the whole list -- see the note on `entries` in `types.ts`.
	const write = (next: Entry[]) => storage?.set({ entries: next })

	const toEntry = (plugin: Installed): Entry => ({
		id: plugin.id,
		name: plugin.name,
		icon: plugin.icon,
		ai: plugin.ai,
		aiOptional: plugin.aiOptional,
		description: plugin.description,
	})

	const setPinned = (plugin: Installed, on: boolean) =>
		write(
			on
				? pinned.has(plugin.id)
					? entries
					: [...entries, toEntry(plugin)]
				: entries.filter(entry => entry.id !== plugin.id),
		)

	const installed = listInstalled()
	const available = discoveryAvailable()

	const openable = (plugin: Installed) => plugin.hasSettings
	const mine = installed?.filter(plugin => plugin.mine && !usesAiCore(plugin)) ?? []
	const ai = installed?.filter(usesAiCore) ?? []
	const others =
		installed?.filter(plugin => !plugin.mine && !usesAiCore(plugin)) ?? []

	const addAll = (list: Installed[]) =>
		write([
			...entries,
			...list
				.filter(plugin => openable(plugin) && !pinned.has(plugin.id))
				.map(toEntry),
		])
	const removeAll = (list: Installed[]) => {
		const ids = new Set(list.map(plugin => plugin.id))
		write(entries.filter(entry => !ids.has(entry.id)))
	}

	/** Destructive, so confirmed -- the design language's rule for anything that removes. */
	const confirmRemoveAll = (list: Installed[], count: number) => {
		const key = 'PluginHubRemoveAll'
		Alerts.openAlert(
			key,
			<AlertModal
				title="Remove all bleelblep plugins?"
				content={`${count} shortcut${count === 1 ? '' : 's'} will come out of the hub. The plugins themselves are not touched.`}
				actions={
					<>
						<AlertActionButton
							text="Remove"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								removeAll(list)
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	const allMine = [...mine, ...ai.filter(plugin => plugin.mine)]
	const mineOpenable = allMine.filter(openable)
	const minePinned = mineOpenable.filter(plugin => pinned.has(plugin.id)).length

	const switchRow = (plugin: Installed) => (
		<TableSwitchRow
			key={plugin.id}
			label={plugin.name}
			subLabel={
				!plugin.hasSettings
					? 'Has no settings page, so there is nothing to open'
					: !plugin.enabled
						? `Switched off${plugin.author ? ` · ${plugin.author}` : ''}`
						: plugin.author
			}
			icon={rowIcon(plugin.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
			disabled={!plugin.hasSettings}
			value={pinned.has(plugin.id)}
			onValueChange={value => setPinned(plugin, value)}
		/>
	)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{!available ? (
						<Card variant="secondary" border="none">
							<View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
								<Text color="text-default" variant="text-md/semibold">
									Turn on Developer Mode to add plugins
								</Text>
								<Text
									color="text-muted"
									variant="text-sm/normal"
									style={{ marginTop: 8 }}
								>
									Revenge only shares the list of installed plugins with
									Developer Mode on (Revenge settings → Developer Mode). Turn it
									on, come back here, pick your plugins — then you can turn it
									off again. The hub keeps working either way, and removing
									plugins never needs it.
								</Text>
							</View>
						</Card>
					) : null}

					{available ? (
						<>
							{mineOpenable.length ? (
								<TableRowGroup title="All bleelblep plugins" hasIcons>
									<TableRow
										label={
											minePinned === mineOpenable.length
												? 'All added'
												: 'Add all of them'
										}
										subLabel={`${minePinned} of ${mineOpenable.length} in the hub`}
										icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
										disabled={minePinned === mineOpenable.length}
										onPress={() => addAll(allMine)}
									/>
									<TableRow
										label="Remove all of them"
										icon={rowIcon('TrashIcon')}
										disabled={minePinned === 0}
										onPress={() => confirmRemoveAll(allMine, minePinned)}
									/>
								</TableRowGroup>
							) : null}

							{mine.length ? (
								<TableRowGroup title="bleelblep plugins" hasIcons>
									{mine.map(switchRow)}
								</TableRowGroup>
							) : null}

							{ai.length ? (
								<TableRowGroup title="AI Hub" hasIcons>
									{ai.map(switchRow)}
								</TableRowGroup>
							) : null}

							{others.length ? (
								<TableRowGroup title="Other plugins" hasIcons>
									{others.map(switchRow)}
								</TableRowGroup>
							) : null}
						</>
					) : entries.length ? (
						<TableRowGroup title="In the hub" hasIcons>
							{entries.map(entry => (
								<TableRow
									key={entry.id}
									label={entry.name}
									subLabel="Tap to remove"
									icon={rowIcon(
										entry.icon ?? 'PuzzlePieceIcon',
										'PuzzlePieceIcon',
									)}
									onPress={() => write(entries.filter(e => e.id !== entry.id))}
								/>
							))}
						</TableRowGroup>
					) : null}

				</Stack>
			</ScrollView>
		</Page>
	)
}
