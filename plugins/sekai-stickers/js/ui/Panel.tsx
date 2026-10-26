import { CHARACTERS, type CharacterRow } from '../data/characters'
import { backToTextField } from '../lib/chatInput'
import { DEFAULT_BEND, HEIGHT, WIDTH, clamp, defaults, letters, movePicture, place, upgrade } from '../lib/design'
import {
	fontMetrics,
	forgetRender,
	keepRender,
	loadFontMetrics,
	measureLetters,
	type Rendered,
	renderSticker,
	reuseSaved,
} from '../lib/native'
import { type SavedSticker, type StickerDesign, settings, update, useSettings } from '../lib/store'
import { attach } from '../lib/upload'
import { FieldRow } from '../../../../shared/ui/fieldGroup'
import { rowIcon } from '../../../../shared/ui/icon'
import { SheetFlatList, SheetScrollView } from './sheet'
import TextLayer from './TextLayer'
import { showToast } from '../../../../shared/toast'
import { getAssetIdByName } from '@revenge-mod/assets'
import { AlertActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import * as React from 'react'
import * as ReactNative from 'react-native'
import { reportError } from '../../../../shared/report'

/**
 * What the Sekai tab shows.
 *
 * - The grid, laid out like Discord's sticker picker: a search bar, one list with a section per
 *   character (your Saved stickers first), and a bar of character faces along the bottom that
 *   jumps to each section. Tapping a sticker opens it in the editor; tapping a saved one adds it
 *   straight to the message. Holding any of them shows it big with Add / Customise (and Edit /
 *   Delete for saved ones). The filter button hides characters you never use. Search, like the
 *   text, is typed in a dialog (see the last note).
 * - The editor: a live preview (the picture plus ui/TextLayer.tsx), fixed above the controls so
 *   dragging on it never fights their scrolling. In Text mode, drag to move the text, tap to put
 *   its middle somewhere, pinch to resize and tilt it. In Picture mode, drag moves the picture and
 *   pinch resizes it. Below, the controls are Discord rows: the text, its size, tilt, spacing and
 *   curve, then the picture's size.
 *
 * Add to message has the native side draw the PNG, queues it as an attachment and returns you to
 * the text field.
 *
 * The text is edited in a dialog, not a field in the panel: the picker stands in for the keyboard,
 * and focusing a text field in it would bring the system keyboard up in its place.
 */

const IMAGE_HOST = 'https://st.ayaka.one/img/'
const COLUMNS = 4
const SAVED = '__saved'

type Mode =
	| { kind: 'grid' }
	| { kind: 'edit'; index: number; design?: StickerDesign; savedId?: string }

// Remembered for as long as Discord runs, so switching tabs (or anything else that redraws the
// picker) keeps your place -- including unsaved changes in the editor, kept in `design`.
let lastMode: Mode = { kind: 'grid' }
let lastQuery = ''

/** An icon's asset id, for Discord's IconButton; undefined if this Discord build doesn't have it. */
function assetId(name: string): number | undefined {
	try {
		const id = getAssetIdByName(name)
		return typeof id === 'number' ? id : undefined
	} catch {
		return undefined
	}
}

function toast(content: string) {
	try {
		showToast(content, 'SekaiStickersToast')
	} catch {
		/* a toast is not worth a crash */
	}
}

const characterNames = (() => {
	const seen: string[] = []
	for (const row of CHARACTERS) if (!seen.includes(row[0])) seen.push(row[0])
	return seen
})()

function prettyName(character: string) {
	return character.length <= 4 && character === character.toUpperCase()
		? character
		: character[0].toUpperCase() + character.slice(1)
}

function indexOfImage(img: string) {
	const at = CHARACTERS.findIndex(row => row[2] === img)
	return at < 0 ? 0 : at
}

/** Queues [rendered] on the message box and goes back to typing. */
function addToMessage(rendered: Rendered, channelId?: string): boolean {
	if (!channelId) {
		toast('Open a channel first')
		return false
	}
	try {
		attach(rendered, channelId)
	} catch (failure: any) {
		reportError('[Sekai Stickers] attach failed:', failure)
		toast(`Couldn't add it: ${failure?.message ?? failure}`)
		return false
	}
	if (!backToTextField()) toast('Sticker added. Tap send when ready.')
	return true
}

export default function Panel({ channel }: { channel: any }) {
	const [mode, setMode] = React.useState<Mode>(lastMode)
	const go = (next: Mode) => {
		lastMode = next
		setMode(next)
	}
	if (mode.kind === 'edit') {
		return (
			<Editor
				key={`${mode.index}:${mode.savedId ?? ''}`}
				row={CHARACTERS[mode.index]}
				initial={mode.design}
				savedId={mode.savedId}
				channelId={channel?.id}
				onBack={() => go({ kind: 'grid' })}
				onChange={design => {
					if (lastMode.kind === 'edit') lastMode = { ...lastMode, design }
				}}
			/>
		)
	}
	return <Grid channelId={channel?.id} onEdit={go} />
}

function HiddenCharacters() {
	const { ScrollView, Dimensions } = ReactNative
	const { TableRowGroup, TableSwitchRow } = Design as any
	const s = useSettings()
	const hidden = new Set(s.hidden)
	return (
		<ScrollView style={{ maxHeight: Math.round(Dimensions.get('window').height * 0.5) }} nestedScrollEnabled>
			<TableRowGroup>
				{characterNames.map(name => (
					<TableSwitchRow
						key={name}
						label={prettyName(name)}
						value={!hidden.has(name)}
						onValueChange={(shown: boolean) => {
							const next = new Set(settings().hidden)
							if (shown) next.delete(name)
							else next.add(name)
							update({ hidden: characterNames.filter(n => next.has(n)) })
						}}
					/>
				))}
			</TableRowGroup>
		</ScrollView>
	)
}

function showCharacterList() {
	const { AlertModal, AlertActionButton } = Design as any
	const alerts = AlertActionCreators
	const key = 'SekaiStickersCharacters'
	alerts.openAlert(
		key,
		<AlertModal
			title="Characters"
			content="Switched-off characters are hidden from the sticker grid."
			extraContent={<HiddenCharacters />}
			actions={<AlertActionButton text="Done" variant="primary" onPress={() => alerts.dismissAlert(key)} />}
		/>,
	)
}

type Tile = { kind: 'saved'; sticker: SavedSticker } | { kind: 'sticker'; at: number; row: CharacterRow }

interface Section {
	key: string
	title: string
	/** Picture for the category bar. */
	icon: string
	tiles: Tile[]
}

type ListRow =
	| { type: 'header'; key: string; title: string; section: number }
	| { type: 'tiles'; key: string; tiles: Tile[]; section: number }

const HEADER_HEIGHT = 36
const BAR_HEIGHT = 48
const MUTED = '#949ba4'

const tileUri = (tile: Tile) =>
	tile.kind === 'saved' ? `file://${tile.sticker.path}?v=${tile.sticker.savedAt}` : IMAGE_HOST + tile.row[2]

/** The sticker big, with what you can do with it: Discord's own dialog, as for its sticker details. */
function stickerOptions(tile: Tile, channelId: string | undefined, onEdit: (mode: Mode) => void) {
	const { AlertModal, AlertActionButton } = Design as any
	const { Image } = ReactNative
	const alerts = AlertActionCreators
	const key = 'SekaiStickersOptions'
	const close = () => alerts.dismissAlert(key)
	const saved = tile.kind === 'saved' ? tile.sticker : undefined
	const row = saved ? CHARACTERS[indexOfImage(saved.img)] : (tile as any).row
	const edit = () =>
		onEdit(
			saved
				? { kind: 'edit', index: indexOfImage(saved.img), design: saved, savedId: saved.id }
				: { kind: 'edit', index: (tile as any).at },
		)
	const addNow = () => {
		const ready = saved
			? reuseSaved(saved.id)
			: renderSticker({ img: row[2], color: row[3], ...defaults(row, fontMetrics()) })
		ready.then(copy => addToMessage(copy, channelId)).catch((failure: any) => toast(`Couldn't add it: ${failure?.message ?? failure}`))
	}
	alerts.openAlert(
		key,
		<AlertModal
			title={saved ? saved.text.trim() || saved.name : row[1]}
			content={saved ? `Saved · ${saved.name}` : `“${row[4]}”`}
			extraContent={
				<Image source={{ uri: tileUri(tile) }} style={{ width: '100%', aspectRatio: WIDTH / HEIGHT }} resizeMode="contain" />
			}
			actions={
				<>
					<AlertActionButton text="Add to message" variant="primary" onPress={() => { close(); addNow() }} />
					<AlertActionButton text={saved ? 'Edit' : 'Customise'} variant="secondary" onPress={() => { close(); edit() }} />
					{saved ? (
						<AlertActionButton
							text="Delete"
							variant="destructive"
							onPress={() => {
								close()
								update({ saved: settings().saved.filter(s => s.id !== saved.id) })
								forgetRender(saved.id).catch(() => {})
								toast('Deleted')
							}}
						/>
					) : null}
					<AlertActionButton text="Cancel" variant="secondary" onPress={close} />
				</>
			}
		/>,
	)
}

function searchFor(current: string, onDone: (query: string) => void) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const alerts = AlertActionCreators
	const key = 'SekaiStickersSearch'
	let value = current
	const done = () => {
		alerts.dismissAlert(key)
		onDone(value.trim())
	}
	alerts.openAlert(
		key,
		<AlertModal
			title="Search stickers"
			content="A character, a sticker's name or its text."
			extraContent={
				<TextInput defaultValue={current} placeholder="Miku, Airi 05, keep up…" autoFocus onChange={(text: string) => (value = text)} onSubmitEditing={done} />
			}
			actions={
				<>
					<AlertActionButton text="Search" variant="primary" onPress={done} />
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

function matches(query: string, ...fields: string[]) {
	const q = query.toLowerCase()
	return fields.some(field => field.toLowerCase().includes(q))
}

function Grid({ channelId, onEdit }: { channelId?: string; onEdit: (mode: Mode) => void }) {
	const { View, FlatList, Image, Pressable } = ReactNative
	const { Text, IconButton } = Design as any
	const s = useSettings()
	const [query, setQuery] = React.useState(lastQuery)
	const [width, setWidth] = React.useState(0)
	const [current, setCurrent] = React.useState(0)
	const list = React.useRef<any>(null)

	const tile = width > 0 ? Math.floor((width - 8) / COLUMNS) : 0
	const tileHeight = Math.round((tile * HEIGHT) / WIDTH)

	const sections = React.useMemo(() => {
		const hidden = new Set(s.hidden)
		const out: Section[] = []
		const saved = s.saved.filter(sticker => !query || matches(query, sticker.text, sticker.name))
		if (saved.length) out.push({ key: SAVED, title: 'Saved', icon: tileUri({ kind: 'saved', sticker: saved[0] }), tiles: saved.map(sticker => ({ kind: 'saved', sticker })) })
		for (const name of characterNames) {
			if (hidden.has(name) && !query) continue
			const tiles: Tile[] = []
			CHARACTERS.forEach((row, at) => {
				if (row[0] !== name) return
				if (query && !matches(query, prettyName(name), row[1], row[4])) return
				tiles.push({ kind: 'sticker', at, row })
			})
			if (tiles.length) out.push({ key: name, title: prettyName(name), icon: IMAGE_HOST + (tiles[0] as any).row[2], tiles })
		}
		return out
	}, [s.saved, s.hidden, query])

	// One flat list of headers and rows of tiles, every height known, so the category bar can
	// jump straight to a section.
	const { rows, offsets, sectionRows } = React.useMemo(() => {
		const rows: ListRow[] = []
		const offsets: number[] = []
		const sectionRows: number[] = []
		let y = 0
		sections.forEach((section, index) => {
			sectionRows.push(rows.length)
			rows.push({ type: 'header', key: `h:${section.key}`, title: section.title, section: index })
			offsets.push(y)
			y += HEADER_HEIGHT
			for (let i = 0; i < section.tiles.length; i += COLUMNS) {
				rows.push({ type: 'tiles', key: `t:${section.key}:${i}`, tiles: section.tiles.slice(i, i + COLUMNS), section: index })
				offsets.push(y)
				y += tileHeight
			}
		})
		return { rows, offsets, sectionRows }
	}, [sections, tileHeight])

	const search = (next: string) => {
		lastQuery = next
		setQuery(next)
		setCurrent(0)
		list.current?.scrollToOffset?.({ offset: 0, animated: false })
	}

	const jump = (index: number) => {
		setCurrent(index)
		list.current?.scrollToIndex?.({ index: sectionRows[index], animated: false })
	}

	// The category bar follows the section at the top of the list.
	const viewable = React.useRef(({ viewableItems }: any) => {
		const row: ListRow | undefined = viewableItems?.[0]?.item
		if (row) setCurrent(row.section)
	}).current

	const renderTile = (item: Tile) => (
		<Pressable
			key={item.kind === 'saved' ? item.sticker.id : item.at}
			accessibilityLabel={item.kind === 'saved' ? item.sticker.text || item.sticker.name : item.row[1]}
			onPress={() => {
				if (item.kind === 'sticker') return onEdit({ kind: 'edit', index: item.at })
				reuseSaved(item.sticker.id)
					.then(copy => addToMessage(copy, channelId))
					.catch((failure: any) => toast(`Couldn't add it: ${failure?.message ?? failure}`))
			}}
			onLongPress={() => stickerOptions(item, channelId, onEdit)}
			delayLongPress={300}
			style={({ pressed }: any) => ({
				width: tile,
				height: tileHeight,
				padding: 4,
				borderRadius: 8,
				backgroundColor: pressed ? 'rgba(128,128,128,0.22)' : 'transparent',
				transform: [{ scale: pressed ? 0.94 : 1 }],
			})}
		>
			<Image source={{ uri: tileUri(item) }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
		</Pressable>
	)

	const magnifier = assetId('MagnifyingGlassIcon')
	const clear = assetId('XSmallIcon')
	const filters = assetId('FiltersHorizontalIcon')

	return (
		<View style={{ flex: 1 }} onLayout={(event: any) => setWidth(event.nativeEvent.layout.width)}>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, paddingVertical: 8 }}>
				<Pressable
					onPress={() => searchFor(query, search)}
					accessibilityRole="search"
					style={{
						flex: 1,
						height: 36,
						borderRadius: 18,
						paddingHorizontal: 12,
						flexDirection: 'row',
						alignItems: 'center',
						gap: 8,
						backgroundColor: 'rgba(128,128,128,0.15)',
					}}
				>
					{magnifier !== undefined ? <Image source={magnifier} style={{ width: 16, height: 16, tintColor: MUTED }} /> : null}
					<Text variant="text-md/normal" color={query ? 'text-default' : 'text-muted'} style={{ flex: 1 }} numberOfLines={1}>
						{query || 'Search Sekai stickers'}
					</Text>
				</Pressable>
				{query && IconButton && clear !== undefined ? (
					<IconButton icon={clear} size="sm" variant="secondary" accessibilityLabel="Clear search" onPress={() => search('')} />
				) : null}
				{IconButton && filters !== undefined ? (
					<IconButton icon={filters} size="sm" variant="secondary" accessibilityLabel="Choose characters" onPress={showCharacterList} />
				) : null}
			</View>

			{tile <= 0 ? null : (
				<SheetFlatList
					listRef={list}
					style={{ flex: 1 }}
					data={rows}
					keyExtractor={(row: ListRow) => row.key}
					contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 12 }}
					initialNumToRender={8}
					windowSize={7}
					getItemLayout={(_: unknown, index: number) => ({
						index,
						offset: offsets[index],
						length: rows[index].type === 'header' ? HEADER_HEIGHT : tileHeight,
					})}
					onViewableItemsChanged={viewable}
					viewabilityConfig={{ itemVisiblePercentThreshold: 10 }}
					ListEmptyComponent={
						<Text variant="text-sm/normal" color="text-muted" style={{ padding: 16, textAlign: 'center' }}>
							{query ? `No stickers match “${query}”.` : 'Every character is hidden. Tap the filter button to show some.'}
						</Text>
					}
					renderItem={({ item }: { item: ListRow }) =>
						item.type === 'header' ? (
							<View style={{ height: HEADER_HEIGHT, justifyContent: 'flex-end', paddingHorizontal: 8, paddingBottom: 6 }}>
								<Text variant="text-xs/bold" color="text-muted" style={{ textTransform: 'uppercase' }}>
									{item.title}
								</Text>
							</View>
						) : (
							<View style={{ flexDirection: 'row', height: tileHeight }}>{item.tiles.map(renderTile)}</View>
						)
					}
				/>
			)}

			{sections.length > 1 ? (
				<FlatList
					horizontal
					data={sections}
					keyExtractor={(section: Section) => section.key}
					showsHorizontalScrollIndicator={false}
					style={{ flexGrow: 0, height: BAR_HEIGHT, borderTopWidth: 1, borderTopColor: 'rgba(128,128,128,0.18)' }}
					contentContainerStyle={{ paddingHorizontal: 8, alignItems: 'center', gap: 4 }}
					renderItem={({ item, index }: { item: Section; index: number }) => (
						<Pressable
							onPress={() => jump(index)}
							accessibilityLabel={item.title}
							style={({ pressed }: any) => ({
								width: 40,
								height: 40,
								borderRadius: 20,
								padding: 3,
								backgroundColor: index === current ? 'rgba(128,128,128,0.28)' : pressed ? 'rgba(128,128,128,0.16)' : 'transparent',
							})}
						>
							<Image source={{ uri: item.icon }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
						</Pressable>
					)}
				/>
			) : null}
		</View>
	)
}

function editText(current: string, onDone: (text: string) => void) {
	const { AlertModal, AlertActionButton, TextInput, TextArea } = Design as any
	const alerts = AlertActionCreators
	const key = 'SekaiStickersText'
	let value = current
	const Field = TextArea ?? TextInput
	alerts.openAlert(
		key,
		<AlertModal
			title="Sticker text"
			content="A new line starts a new line on the sticker."
			extraContent={
				<Field defaultValue={current} placeholder="Say something" autoFocus multiline onChange={(text: string) => (value = text)} />
			}
			actions={
				<>
					<AlertActionButton
						text="Done"
						variant="primary"
						onPress={() => {
							alerts.dismissAlert(key)
							onDone(value)
						}}
					/>
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}

const touchDistance = (a: any, b: any) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY)
const touchAngle = (a: any, b: any) => Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX)

function Editor({
	row,
	initial,
	savedId,
	channelId,
	onBack,
	onChange,
}: {
	row: CharacterRow
	initial?: StickerDesign
	savedId?: string
	channelId?: string
	onBack: () => void
	onChange: (design: StickerDesign) => void
}) {
	const { View, Image, PanResponder, ActivityIndicator } = ReactNative
	const { Text, Button, Slider, IconButton, TableRowGroup, TableRow, TableSwitchRow } = Design as any

	const [metrics, setMetrics] = React.useState(fontMetrics)
	const [design, setDesign] = React.useState<StickerDesign>(() =>
		initial ? upgrade(initial, fontMetrics()) : defaults(row, fontMetrics()),
	)
	const [loaded, setLoaded] = React.useState(false)
	const [busy, setBusy] = React.useState(false)
	const [touching, setTouching] = React.useState(false)
	const [target, setTarget] = React.useState<'text' | 'picture'>('text')
	const [area, setArea] = React.useState({ width: 0, height: 0 })
	const [, remeasured] = React.useReducer((n: number) => n + 1, 0)
	const set = (patch: Partial<StickerDesign>) => setDesign(previous => ({ ...previous, ...patch }))

	const live = React.useRef(design)
	live.current = design
	const mounted = React.useRef(true)
	React.useEffect(
		() => () => {
			mounted.current = false
		},
		[],
	)

	React.useEffect(() => {
		onChange(design)
	}, [design])

	React.useEffect(() => {
		loadFontMetrics().then(next => {
			if (mounted.current) setMetrics(next)
		})
	}, [])

	// Curved text is laid out letter by letter, so it needs each letter's real width.
	React.useEffect(() => {
		if (!design.bend) return
		measureLetters(letters(design.text.replace(/\n/g, '')))
			.then(changed => {
				if (changed && mounted.current) remeasured()
			})
			.catch((failure: any) => reportError('[Sekai Stickers] measuring letters failed:', failure))
	}, [design.text, design.bend !== 0])

	// At most half the panel's height, so the controls below keep some room.
	const previewWidth =
		area.width > 0 ? Math.floor(Math.min(area.width - 32, WIDTH * 1.4, ((area.height * 0.5) * WIDTH) / HEIGHT)) : 0
	const previewHeight = Math.round((previewWidth * HEIGHT) / WIDTH)
	const scale = previewWidth > 0 ? WIDTH / previewWidth : 1

	// Text mode: one finger drags the text (or a quick tap puts its middle there); two fingers pinch
	// to resize and twist it. Picture mode: one finger moves the picture, two resize it.
	const targetRef = React.useRef(target)
	targetRef.current = target
	const gesture = React.useRef<any>(null)
	const responder = React.useMemo(
		() =>
			PanResponder.create({
				onStartShouldSetPanResponder: () => true,
				onMoveShouldSetPanResponder: () => true,
				onPanResponderTerminationRequest: () => false,
				onShouldBlockNativeResponder: () => true,
				onPanResponderGrant: (event: any) => {
					const n = event.nativeEvent
					gesture.current = {
						start: { ...live.current },
						tapX: n.locationX,
						tapY: n.locationY,
						moved: false,
						pinch: null,
					}
					setTouching(true)
				},
				onPanResponderMove: (event: any, g: any) => {
					const current = gesture.current
					if (!current) return
					const touches = event.nativeEvent.touches ?? []
					if (touches.length >= 2) {
						const [a, b] = touches
						if (!current.pinch) {
							current.pinch = {
								distance: touchDistance(a, b),
								angle: touchAngle(a, b),
								size: live.current.size,
								rotate: live.current.rotate,
								imageScale: live.current.imageScale,
							}
						}
						const p = current.pinch
						current.moved = true
						const stretch = touchDistance(a, b) / Math.max(1, p.distance)
						if (targetRef.current === 'picture') {
							set({ imageScale: Math.round(clamp(p.imageScale * stretch, 20, 400)) })
							return
						}
						set({
							size: Math.round(clamp((p.size * touchDistance(a, b)) / Math.max(1, p.distance), 10, 140)),
							rotate: Math.round(clamp(p.rotate + (touchAngle(a, b) - p.angle) * 10, -10, 10) * 10) / 10,
						})
						return
					}
					if (current.pinch) return
					if (Math.abs(g.dx) + Math.abs(g.dy) > 6) current.moved = true
					if (!current.moved) return
					if (targetRef.current === 'picture') {
						set(movePicture(current.start.imageX + g.dx * scale, current.start.imageY + g.dy * scale))
						return
					}
					set(place(current.start.x + g.dx * scale, current.start.y + g.dy * scale))
				},
				onPanResponderRelease: () => {
					const current = gesture.current
					gesture.current = null
					setTouching(false)
					if (current && !current.moved && targetRef.current === 'text' && typeof current.tapX === 'number') {
						set(place(current.tapX * scale, current.tapY * scale))
					}
				},
				onPanResponderTerminate: () => {
					gesture.current = null
					setTouching(false)
				},
			}),
		[scale],
	)


	/** The native side draws the PNG only now; the preview above is React Native. */
	const draw = async (): Promise<Rendered | null> => {
		setBusy(true)
		try {
			return await renderSticker({ img: row[2], color: row[3], ...live.current })
		} catch (failure: any) {
			toast(`Couldn't draw it: ${failure?.message ?? failure}`)
			return null
		} finally {
			if (mounted.current) setBusy(false)
		}
	}

	const add = async () => {
		const rendered = await draw()
		if (rendered) addToMessage(rendered, channelId)
	}

	const save = async () => {
		const rendered = await draw()
		if (!rendered) return
		const id = savedId ?? `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
		try {
			const path = await keepRender(rendered.path, id)
			const sticker: SavedSticker = { ...live.current, id, img: row[2], color: row[3], name: row[1], path, savedAt: Date.now() }
			const others = settings().saved.filter(s => s.id !== id)
			update({ saved: [sticker, ...others] })
			toast(savedId ? 'Saved changes' : 'Saved to ★ Saved')
		} catch (failure: any) {
			toast(`Couldn't save it: ${failure?.message ?? failure}`)
		}
	}

	const back = assetId('ArrowLargeLeftIcon')
	const star = assetId(savedId ? 'StarIcon' : 'StarOutlineIcon')
	const pictureChanged = design.imageScale !== 100 || !!design.imageX || !!design.imageY

	return (
		<View
			style={{ flex: 1 }}
			onLayout={(event: any) => setArea({ width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height })}
		>
			{/* Fixed above the controls, so dragging on the preview never fights their scrolling. */}
			<View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
					{IconButton && back !== undefined ? (
						<IconButton icon={back} size="sm" variant="tertiary" accessibilityLabel="Back to stickers" onPress={onBack} />
					) : (
						<Button text="Back" size="sm" variant="secondary" onPress={onBack} />
					)}
					<Text variant="heading-md/semibold" color="text-default" style={{ flex: 1 }} numberOfLines={1}>
						{row[1]}
					</Text>
					{IconButton && star !== undefined ? (
						<IconButton
							icon={star}
							size="sm"
							variant="secondary"
							disabled={busy}
							accessibilityLabel={savedId ? 'Update saved sticker' : 'Save sticker'}
							onPress={save}
						/>
					) : (
						<Button text={savedId ? 'Update' : 'Save'} size="sm" variant="secondary" disabled={busy} onPress={save} />
					)}
					<Button text="Add" size="sm" variant="primary" disabled={busy} loading={busy} onPress={add} />
				</View>

				{previewWidth > 0 ? (
					<View
						{...responder.panHandlers}
						style={{ width: previewWidth, height: previewHeight, alignSelf: 'center', marginTop: 12, overflow: 'hidden' }}
					>
						<Image
							source={{ uri: IMAGE_HOST + row[2] }}
							style={{
								position: 'absolute',
								width: (previewWidth * design.imageScale) / 100,
								height: (previewHeight * design.imageScale) / 100,
								left: (previewWidth * (1 - design.imageScale / 100)) / 2 + design.imageX / scale,
								top: (previewHeight * (1 - design.imageScale / 100)) / 2 + design.imageY / scale,
							}}
							resizeMode="contain"
							fadeDuration={0}
							onLoad={() => setLoaded(true)}
						/>
						{loaded ? null : (
							<ActivityIndicator style={{ position: 'absolute', alignSelf: 'center', top: previewHeight / 2 - 10 }} />
						)}
						<TextLayer design={design} color={row[3]} scale={scale} metrics={metrics} />
						{/* The middle of the text: what dragging moves and where a tap puts it. */}
						<View
							pointerEvents="none"
							style={{
								position: 'absolute',
								left: design.x / scale - 9,
								top: design.y / scale - 9,
								width: 18,
								height: 18,
								borderRadius: 9,
								borderWidth: 2,
								borderColor: row[3],
								backgroundColor: 'rgba(255,255,255,0.6)',
								opacity: target === 'picture' ? 0 : touching ? 1 : 0.4,
							}}
						/>
					</View>
				) : null}

				<View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
					{(['text', 'picture'] as const).map(value => (
						<View key={value} style={{ flex: 1 }}>
							<Button
								text={value === 'text' ? 'Move text' : 'Move picture'}
								size="sm"
								variant={target === value ? 'primary' : 'secondary'}
								onPress={() => setTarget(value)}
							/>
						</View>
					))}
				</View>
				<Text variant="text-xs/normal" color="text-muted" style={{ textAlign: 'center', marginTop: 6, marginBottom: 4 }}>
					{target === 'text' ? 'Drag to move · tap to place · pinch to resize and tilt' : 'Drag to move · pinch to resize'}
				</Text>
			</View>

			<SheetScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
				keyboardShouldPersistTaps="handled"
			>
				<View style={{ gap: 16 }}>
					<TableRowGroup title="Text">
						<TableRow
							label="Text"
							subLabel={design.text.trim() ? design.text : 'Tap to write something'}
							icon={rowIcon('TextIcon', 'LettersIcon')}
							arrow
							onPress={() => editText(design.text, text => set({ text }))}
						/>
						<FieldRow label={`Size — ${design.size}`}>
							<Slider value={design.size} minimumValue={10} maximumValue={140} step={1} onValueChange={(size: number) => set({ size })} />
						</FieldRow>
						<FieldRow label={`Tilt — ${design.rotate.toFixed(1)}`}>
							<Slider
								value={design.rotate}
								minimumValue={-10}
								maximumValue={10}
								step={0.1}
								onValueChange={(rotate: number) => set({ rotate })}
							/>
						</FieldRow>
						{design.text.includes('\n') ? (
							<FieldRow label={`Line spacing — ${design.lineSpacing}%`}>
								<Slider
									value={design.lineSpacing}
									minimumValue={60}
									maximumValue={200}
									step={1}
									onValueChange={(lineSpacing: number) => set({ lineSpacing })}
								/>
							</FieldRow>
						) : null}
						<TableSwitchRow
							label="Curve"
							subLabel="Bend each line along an arc"
							icon={rowIcon('ArrowsUpDownIcon')}
							value={!!design.bend}
							onValueChange={(on: boolean) => set({ bend: on ? DEFAULT_BEND : 0 })}
						/>
						{design.bend ? (
							<FieldRow
								label={`Curve — ${design.bend > 0 ? 'arch' : 'dip'} ${Math.abs(design.bend)}`}
								description="Slide left to dip, right to arch."
							>
								<Slider
									value={design.bend}
									minimumValue={-100}
									maximumValue={100}
									step={1}
									onValueChange={(bend: number) => set({ bend: bend === 0 ? 1 : bend })}
								/>
							</FieldRow>
						) : null}
						<TableRow
							label="Centre text"
							subLabel="Line it up with the middle of the sticker"
							icon={rowIcon('ArrowsLeftRightIcon')}
							onPress={() => set({ x: WIDTH / 2 })}
						/>
					</TableRowGroup>

					<TableRowGroup title="Picture">
						<FieldRow label={`Size — ${design.imageScale}%`}>
							<Slider
								value={design.imageScale}
								minimumValue={20}
								maximumValue={400}
								step={1}
								onValueChange={(imageScale: number) => set({ imageScale })}
							/>
						</FieldRow>
						<TableRow
							label="Reset picture"
							subLabel="Back to its original size and place"
							icon={rowIcon('ImageIcon')}
							disabled={!pictureChanged}
							onPress={() => set({ imageScale: 100, imageX: 0, imageY: 0 })}
						/>
					</TableRowGroup>

					<TableRowGroup>
						<TableRow
							label="Start over"
							subLabel="This character's own text, size and place"
							icon={rowIcon('RefreshIcon', 'RetryIcon')}
							onPress={() => setDesign(defaults(row, metrics))}
						/>
					</TableRowGroup>
				</View>
			</SheetScrollView>
		</View>
	)
}
