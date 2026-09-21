/**
 * The pieces every layout is built from: a tile, a card, and a grid that lays either out.
 *
 * ## Icons
 *
 * Tiles want a bigger icon than a settings row, but the row icon (`TableRow.Icon`, via `rowIcon`)
 * is the one that already gets the theme's tint right in light and dark mode. Drawing icons
 * directly would mean resolving theme colours by hand, which is exactly the kind of guess that
 * rendered `text-normal` black in this repository. So the row icon is reused and scaled up.
 *
 * ## Sizing
 *
 * Grid tiles are sized from the measured width of the container rather than from percentages,
 * so a row with fewer tiles than columns keeps them the same width instead of stretching or
 * spreading them.
 *
 * Every `revenge.*` read happens inside a render, never at module scope (porting rule 1).
 */

import { rowIcon } from '../icon'
import type { Entry } from '../../types'

export interface TileState {
	openable: boolean
	note?: string
}

const GAP = 8

function Icon({ name, scale }: { name?: string; scale: number }) {
	const { View } = revenge.react.ReactNative
	return (
		<View
			style={{
				transform: [{ scale }],
				alignItems: 'center',
				justifyContent: 'center',
			}}
		>
			{rowIcon(name ?? 'PuzzlePieceIcon', 'PuzzlePieceIcon') ?? null}
		</View>
	)
}

/** The surface a tile or card sits on: a pressable Card, dimmed when it cannot open. */
function Surface({
	state,
	onPress,
	style,
	children,
}: {
	state: TileState
	onPress: () => void
	style?: any
	children: any
}) {
	const { Pressable } = revenge.react.ReactNative
	const { Card } = revenge.discord.design.Design
	return (
		<Pressable
			disabled={!state.openable}
			onPress={onPress}
			style={({ pressed }: { pressed: boolean }) => [
				style,
				{ opacity: state.openable ? (pressed ? 0.6 : 1) : 0.4 },
			]}
		>
			<Card variant="secondary" border="none" style={{ flex: 1 }}>
				{children}
			</Card>
		</Pressable>
	)
}

/** Icon on top, name underneath. Used by Icon grid, Shelves and the Favourites tiles. */
export function Tile({
	entry,
	state,
	onPress,
	width,
	big,
}: {
	entry: Entry
	state: TileState
	onPress: () => void
	width: number
	big?: boolean
}) {
	const { View } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design
	return (
		<Surface state={state} onPress={onPress} style={{ width }}>
			<View
				style={{
					alignItems: 'center',
					paddingVertical: big ? 18 : 14,
					paddingHorizontal: 6,
					gap: big ? 14 : 10,
				}}
			>
				<Icon name={entry.icon} scale={big ? 1.8 : 1.4} />
				<Text
					color="text-default"
					variant={big ? 'text-md/semibold' : 'text-sm/semibold'}
					style={{ textAlign: 'center' }}
					numberOfLines={2}
				>
					{entry.name}
				</Text>
				{state.note ? (
					<Text color="text-muted" variant="text-xs/normal" numberOfLines={1}>
						{state.note}
					</Text>
				) : null}
			</View>
		</Surface>
	)
}

/** Icon and name side by side, with the description underneath. The Cards layout. */
export function PluginCard({
	entry,
	state,
	onPress,
	width,
	description,
}: {
	entry: Entry
	state: TileState
	onPress: () => void
	width: number
	description?: string
}) {
	const { View } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design
	return (
		<Surface state={state} onPress={onPress} style={{ width }}>
			<View style={{ padding: 12, gap: 8 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
					<Icon name={entry.icon} scale={1.2} />
					<Text
						color="text-default"
						variant="text-sm/semibold"
						numberOfLines={2}
						style={{ flex: 1 }}
					>
						{entry.name}
					</Text>
				</View>
				<Text color="text-muted" variant="text-xs/normal" numberOfLines={3}>
					{state.note ?? description ?? ' '}
				</Text>
			</View>
		</Surface>
	)
}

/**
 * Lays children out in `columns` equal columns, sized from the measured width.
 *
 * Renders nothing until the first layout pass reports a width -- one frame, and far better than
 * one frame of tiles at the wrong size.
 */
export function Grid({
	columns,
	children,
}: {
	columns: number
	children: (tileWidth: number) => any
}) {
	const { View } = revenge.react.ReactNative
	const React = revenge.react.React
	const [width, setWidth] = React.useState(0)
	const tile = width ? Math.floor((width - GAP * (columns - 1)) / columns) : 0

	return (
		<View
			onLayout={(event: any) => setWidth(event.nativeEvent.layout.width)}
			style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}
		>
			{tile ? children(tile) : null}
		</View>
	)
}

/** One sideways-scrolling row of tiles. The Shelves layout. */
export function Shelf({ children }: { children: any }) {
	const { ScrollView } = revenge.react.ReactNative
	return (
		<ScrollView
			horizontal
			showsHorizontalScrollIndicator={false}
			contentContainerStyle={{ gap: GAP, paddingRight: 16 }}
		>
			{children}
		</ScrollView>
	)
}

export const SHELF_TILE_WIDTH = 96
