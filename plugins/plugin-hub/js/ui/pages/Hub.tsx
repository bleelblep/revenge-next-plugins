import { DEFAULTS } from '../../defaults'
import { aiRouteOf, listInstalled, MY_PREFIX, onPage } from '../../lib/installed'
import { getStorage } from '../../lib/state'
import { Grid, GRID_GAP, Tile } from '../components/Tiles'
import { rowIcon } from '../icon'
import { AI_SETTINGS_ROUTE, MANAGE_ROUTE, SETTINGS_ROUTE } from '../routes'
import { useBottomPadding } from '../safeArea'
import type { Entry } from '../../types'
import type { TileState } from '../components/Tiles'

/** The most each page shows as tiles. Four is a 2×2 block: big, and still one glance. */
export const MAX_FAVOURITES = 4

/**
 * A hub page: favourites as a 2×2 block of tiles, everything else as a list under it. The Hub
 * shows every pinned plugin that does not use AI Core; the AI Hub shows the ones that do. Both
 * pages look and behave the same, and each keeps its own favourites.
 *
 * Opening a plugin is `navigate(plugin id)`, because Revenge registers every running plugin's
 * settings page as a route named after the plugin (revenge-bundle-next,
 * `src/plugins/start/settings.plugins/plugins.tsx`). That works with or without Developer Mode;
 * Developer Mode only adds the ability to tell a plugin that is not running from one that is.
 *
 * The settings icon in the header opens that page's own settings (Hub settings or AI Hub settings).
 */
export default function Hub() {
	return <HubPage ai={false} />
}

export function AiHub() {
	return <HubPage ai />
}

/** Starred favourites first, in their chosen order; with none starred, the first four by name. */
export function favouritesFor(entries: Entry[], ai: boolean): Entry[] {
	const own = entries.filter(entry => onPage(entry, ai))
	const starred = own.filter(entry => entry.favourite)
	const pool = starred.length ? starred : byName(own)
	return pool.slice(0, MAX_FAVOURITES)
}

export const byName = (list: Entry[]) =>
	[...list].sort((a, b) => a.name.localeCompare(b.name))

function HubPage({ ai }: { ai: boolean }) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { Page } = revenge.components
	const { ScrollView, View, Pressable } = revenge.react.ReactNative
	const { Stack, Text, TableRowGroup, TableRow } = revenge.discord.design.Design
	const { useNavigation } =
		revenge.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as {
		navigate: (route: string) => void
		setOptions?: (options: Record<string, unknown>) => void
	}
	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const all: Entry[] = s.entries ?? []
	const entries = all.filter(entry => onPage(entry, ai))

	// A settings icon at the top right, opening this page's own settings: Hub settings from the Hub,
	// AI Hub settings from the AI Hub.
	React.useLayoutEffect(() => {
		navigation.setOptions?.({
			headerRight: () => (
				<Pressable
					accessibilityRole="button"
					accessibilityLabel={ai ? 'AI Hub settings' : 'Hub settings'}
					hitSlop={12}
					onPress={() => navigation.navigate(ai ? AI_SETTINGS_ROUTE : SETTINGS_ROUTE)}
					style={({ pressed }: { pressed: boolean }) => ({
						paddingHorizontal: 12,
						opacity: pressed ? 0.5 : 1,
					})}
				>
					{rowIcon('SettingsIcon', 'WrenchIcon')}
				</Pressable>
			),
		})
	}, [])

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
	// On the AI Hub, a plugin that named its AI screen opens there; everything else opens its settings.
	const open = (entry: Entry) => () =>
		navigation.navigate((ai && aiRouteOf(entry.id)) || entry.id)
	// Entries saved before descriptions were stored get theirs from the live list when possible.
	const descriptionOf = (entry: Entry) =>
		entry.description ?? byId.get(entry.id)?.description

	const favourites = favouritesFor(all, ai)
	const favIds = new Set(favourites.map(entry => entry.id))

	// Everything that is not a favourite, alphabetically. The Hub splits bleelblep's from
	// everyone else's; the AI Hub is one list, since AI Core's plugins are all bleelblep's so far.
	const isMine = (entry: Entry) => entry.id.startsWith(MY_PREFIX)
	const rest = byName(entries.filter(entry => !favIds.has(entry.id)))
	const sections: Array<{ title?: string; entries: Entry[] }> = ai
		? [{ entries: rest }]
		: [
				{ title: 'bleelblep plugins', entries: rest.filter(isMine) },
				{ title: 'Other plugins', entries: rest.filter(entry => !isMine(entry)) },
			]

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

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					{entries.length ? (
						<>
							<View style={{ gap: 8 }}>
								<Text color="text-muted" variant="text-sm/semibold">
									Favourites
								</Text>
								{/* A favourite with no partner on its row -- the only one, or the last of
								    an odd number -- spans the row as a wide card instead of half of it. */}
								<Grid columns={2}>
									{width =>
										favourites.map((entry, index) => {
											const wide =
												favourites.length % 2 === 1 &&
												index === favourites.length - 1
											return (
												<Tile
													key={entry.id}
													entry={entry}
													state={stateOf(entry)}
													onPress={open(entry)}
													width={wide ? width * 2 + GRID_GAP : width}
													wide={wide}
													description={descriptionOf(entry)}
												/>
											)
										})
									}
								</Grid>
							</View>
							{sections
								.filter(section => section.entries.length)
								.map(section => (
									<TableRowGroup
										key={section.title ?? 'all'}
										title={section.title}
										hasIcons
									>
										{section.entries.map(listRow)}
									</TableRowGroup>
								))}
						</>
					) : (
						<>
							<Text color="text-muted" variant="text-sm/normal">
								{ai
									? 'No AI plugins here yet. Choose them and they will appear here, one tap from their settings.'
									: 'Nothing here yet. Choose the plugins you open most and they will appear here, one tap from their settings.'}
							</Text>
							<TableRowGroup hasIcons>
								<TableRow
									label="Choose plugins"
									icon={rowIcon('PlusSmallIcon', 'PlusLargeIcon')}
									arrow
									onPress={() => navigation.navigate(MANAGE_ROUTE)}
								/>
							</TableRowGroup>
						</>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
