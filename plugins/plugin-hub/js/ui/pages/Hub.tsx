import { DEFAULTS } from '../../defaults'
import { listInstalled, MY_PREFIX, usesAiCore } from '../../lib/installed'
import { getStorage } from '../../lib/state'
import {
	Grid,
	PluginCard,
	SHELF_TILE_WIDTH,
	Shelf,
	Tile,
} from '../components/Tiles'
import { rowIcon } from '../icon'
import { MANAGE_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { Entry } from '../../types'
import type { TileState } from '../components/Tiles'

/** The most the Favourites layout shows as tiles. Four is a 2×2 block: big, and still one glance. */
export const MAX_FAVOURITES = 4

/**
 * A hub page, in whichever layout is chosen. The Hub shows every pinned plugin that does not use
 * AI Core, in the chosen layout; the AI Hub shows the ones that do, always as plain rows.
 *
 * Opening a plugin is `navigate(plugin id)`, because Revenge registers every running plugin's
 * settings page as a route named after the plugin (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/plugins.tsx`). That works with or without Developer Mode;
 * Developer Mode only adds the ability to tell a plugin that is not running from one that is.
 */
export default function Hub() {
	return <HubPage ai={false} />
}

export function AiHub() {
	return <HubPage ai />
}

function HubPage({ ai }: { ai: boolean }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView, View } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const entries: Entry[] = (s.entries ?? []).filter(
		entry => usesAiCore(entry) === ai,
	)

	// Only known when Developer Mode is on; undefined means "cannot tell", not "missing".
	const installed = listInstalled()
	const byId = new Map(installed?.map(plugin => [plugin.id, plugin]))

	const stateOf = (entry: Entry): TileState => {
		if (!installed) return { openable: true }
		const plugin = byId.get(entry.id)
		if (!plugin) return { openable: false, note: 'Not installed' }
		if (!plugin.enabled) return { openable: false, note: 'Switched off' }
		if (!plugin.hasSettings)
			return { openable: false, note: 'No settings page' }
		return { openable: true }
	}
	// Entries saved before descriptions were stored get theirs from the live list when possible.
	const descriptionOf = (entry: Entry) =>
		entry.description ?? byId.get(entry.id)?.description
	const open = (entry: Entry) => () => navigation.navigate(entry.id)

	// The sections every layout shares, in order. Whether an entry is bleelblep's comes from its
	// id, so entries saved before sections existed sort themselves correctly.
	// The AI Hub is one list: AI Core and its dependents are all bleelblep's so far.
	const isMine = (entry: Entry) => entry.id.startsWith(MY_PREFIX)
	const sections: Array<{ title?: string; entries: Entry[] }> = ai
		? [{ entries }]
		: [
				{ title: 'bleelblep plugins', entries: entries.filter(isMine) },
				{
					title: 'Other plugins',
					entries: entries.filter(entry => !isMine(entry)),
				},
			]
	const shown = sections.filter(section => section.entries.length)

	const sectionTitle = (title?: string) =>
		title ? (
			<Text color="text-muted" variant="text-sm/semibold">
				{title}
			</Text>
		) : null

	const listRow = (entry: Entry) => {
		const state = stateOf(entry)
		return (
			<TableRow
				key={entry.id}
				label={entry.name}
				subLabel={state.note}
				icon={rowIcon(entry.icon ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon')}
				arrow={state.openable}
				disabled={!state.openable}
				onPress={state.openable ? open(entry) : undefined}
			/>
		)
	}

	const renderFavourites = () => {
		// Starred ones first; with none starred, the first four fill in so the layout never
		// opens onto an empty block.
		const starred = entries.filter(entry => entry.favourite)
		const favourites = (starred.length ? starred : entries).slice(
			0,
			MAX_FAVOURITES,
		)
		const favIds = new Set(favourites.map(entry => entry.id))
		const rest = shown
			.map(section => ({
				...section,
				entries: section.entries.filter(entry => !favIds.has(entry.id)),
			}))
			.filter(section => section.entries.length)

		return (
			<>
				<View style={{ gap: 8 }}>
					{sectionTitle('Favourites')}
					<Grid columns={2}>
						{width =>
							favourites.map(entry => (
								<Tile
									key={entry.id}
									entry={entry}
									state={stateOf(entry)}
									onPress={open(entry)}
									width={width}
									big
								/>
							))
						}
					</Grid>
				</View>
				{rest.map(section => (
					<TableRowGroup
						key={section.title ?? 'all'}
						title={section.title}
						hasIcons
					>
						{section.entries.map(listRow)}
					</TableRowGroup>
				))}
			</>
		)
	}

	const renderGrid = () =>
		shown.map(section => (
			<View key={section.title ?? 'all'} style={{ gap: 8 }}>
				{sectionTitle(section.title)}
				<Grid columns={3}>
					{width =>
						section.entries.map(entry => (
							<Tile
								key={entry.id}
								entry={entry}
								state={stateOf(entry)}
								onPress={open(entry)}
								width={width}
							/>
						))
					}
				</Grid>
			</View>
		))

	const renderCards = () =>
		shown.map(section => (
			<View key={section.title ?? 'all'} style={{ gap: 8 }}>
				{sectionTitle(section.title)}
				<Grid columns={2}>
					{width =>
						section.entries.map(entry => (
							<PluginCard
								key={entry.id}
								entry={entry}
								state={stateOf(entry)}
								onPress={open(entry)}
								width={width}
								description={descriptionOf(entry)}
							/>
						))
					}
				</Grid>
			</View>
		))

	const renderShelves = () =>
		shown.map(section => (
			<View key={section.title ?? 'all'} style={{ gap: 8 }}>
				{sectionTitle(section.title)}
				<Shelf>
					{section.entries.map(entry => (
						<Tile
							key={entry.id}
							entry={entry}
							state={stateOf(entry)}
							onPress={open(entry)}
							width={SHELF_TILE_WIDTH}
						/>
					))}
				</Shelf>
			</View>
		))

	const body = () => {
		if (ai)
			return (
				<TableRowGroup hasIcons>{entries.map(listRow)}</TableRowGroup>
			)
		switch (s.layout) {
			case 'grid':
				return renderGrid()
			case 'cards':
				return renderCards()
			case 'shelves':
				return renderShelves()
			default:
				return renderFavourites()
		}
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{entries.length ? (
						body()
					) : (
						<Text color="text-muted" variant="text-sm/normal">
							{ai
								? 'No AI plugins here yet. Pick them under Hub > Choose plugins and they will appear here, one tap from their settings.'
								: 'Nothing here yet. Choose the plugins you open most and they will appear here, one tap from their settings.'}
						</Text>
					)}

					{/* Choosing lives on the Hub only; the AI Hub is just the list. */}
					{ai ? null : (
					<TableRowGroup hasIcons>
						<TableRow
							label="Choose plugins"
							subLabel="Add or remove plugins, pick favourites, change the layout"
							icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
							arrow
							onPress={() => navigation.navigate(MANAGE_ROUTE)}
						/>
					</TableRowGroup>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
