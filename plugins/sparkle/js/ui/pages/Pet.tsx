import { LOOKS, lookOf } from "../../native"
import { SizeSlider } from "../sizeSlider"
import { FieldRow } from "../fieldGroup"
import { useBottomPadding } from "../safeArea"
import { token } from "../theme"
import { type PreviewAnimation, update, usePreviewFrames, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as React from "react"
import * as ReactNative from "react-native"
import { reportError } from "../../../../../shared/report"

/**
 * Pet packs, in picker order. A look with a `pack` goes by it; the classic characters go by kind.
 * The first free seasonal pets used to be a group of their own ("Original seasonal"); they now sit in
 * their holiday's pack (the Dragon, with no holiday, in Classic).
 */
const GROUPS = [
	{ id: "classic", label: "Classic", kinds: ["unicorn", "nyan", "gary"] },
	{ id: "cats", label: "Cats", kinds: ["cat"] },
	{ id: "dogs", label: "Dogs", kinds: ["dog"] },
	{ id: "halloween", label: "Halloween", kinds: [] },
	{ id: "christmas", label: "Christmas", kinds: [] },
	{ id: "thanksgiving", label: "Thanksgiving", kinds: [] },
] as const

function inGroup(look: (typeof LOOKS)[number], group: number): boolean {
	return "pack" in look ? look.pack === GROUPS[group].id : (GROUPS[group].kinds as readonly string[]).includes(look.kind)
}

function groupOf(look: number): number {
	return Math.max(0, GROUPS.findIndex((_, i) => inGroup(lookOf(look), i)))
}

/** One frame of an animation sheet: the sheet behind a frame-sized window, moved to that frame. */
function SheetFrame({ anim, frame, hidden, onLoad }: { anim: PreviewAnimation; frame: number; hidden?: boolean; onLoad?: () => void }) {
	const { Image, View, PixelRatio } = ReactNative
	const ratio = PixelRatio.get()
	const w = anim.w / ratio
	const h = anim.h / ratio
	const f = frame % anim.n
	return (
		<View style={{ position: "absolute", width: w, height: h, overflow: "hidden", opacity: hidden ? 0 : 1 }}>
			<Image
				source={{ uri: anim.sheet }}
				onLoad={onLoad}
				fadeDuration={0}
				style={{ position: "absolute", width: w * anim.cols, height: h * Math.ceil(anim.n / anim.cols), left: -(f % anim.cols) * w, top: -Math.floor(f / anim.cols) * h }}
			/>
		</View>
	)
}

/**
 * A pet's animation, looping, drawn pixel for pixel: native scales the frames by a whole number to
 * fit [size] dp, and they're shown at exactly that size, so nothing smooths the pixel art. Switching
 * pets, the old animation stays up until the new one's image has loaded, then they swap: no blank.
 */
function Sprite({ look, size, pose = "IDLE", variant = 0 }: { look: number; size: number; pose?: string; variant?: number }) {
	const { View, PixelRatio } = ReactNative
	const fresh = usePreviewFrames(look, pose, variant, Math.round(size * PixelRatio.get()))
	const [shown, setShown] = React.useState<PreviewAnimation | undefined>(fresh)
	const [frame, setFrame] = React.useState(0)
	const waiting = fresh && fresh.sheet !== shown?.sheet ? fresh : undefined
	React.useEffect(() => {
		setFrame(0)
		if (!shown || shown.n < 2) return
		const timer = setInterval(() => setFrame((n: number) => n + 1), 1000 / shown.fps)
		return () => clearInterval(timer)
	}, [shown])
	return (
		<View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
			{shown ? <SheetFrame anim={shown} frame={frame} /> : null}
			{/* The next pet loads out of sight and takes over once its image is ready. */}
			{waiting ? <SheetFrame key={`${look}:${pose}:${variant}`} anim={waiting} frame={0} hidden onLoad={() => setShown(waiting)} /> : null}
		</View>
	)
}

/** What a fidget plays, by the animation it uses. Per-pet names first, then the shared ones. */
const FIDGET_BY_PET: Record<string, Record<string, string>> = {
	"Cotton Boo": { lick1: "Blink", lick2: "Wiggle" },
	"Vampire Cat": { lick1: "Lick", lick2: "Box" },
	"Santa Cat": { lick1: "Tail flick", lick2: "Stretch" },
	"Elf Cat": { lick1: "Tail flick", lick2: "Stretch" },
	"Reindeer Cat": { lick1: "Tail flick", lick2: "Stretch" },
	"Classic Ghost": { lick1: "Blink" },
	"Dark Ghost": { lick1: "Blink" },
}
const FIDGET_NAMES: Record<string, string> = {
	sit: "Sit", lick1: "Groom", lick2: "Groom again", stretch: "Stretch", peck: "Peck", fidget: "Fidget", idle: "Idle",
}
/** The unicorn's and Nyan Cat's four fidgets are drawn stills, not sheet animations. */
const DRAWN_FIDGETS = ["Plain", "Heart", "Sparkles", "Sunglasses"]

function fidgetName(look: number, strip: string | null | undefined, i: number): string {
	const pet = lookOf(look)
	if (pet.kind === "unicorn" || pet.kind === "nyan") return DRAWN_FIDGETS[i]
	if (!strip) return `Fidget ${i + 1}`
	if (pet.label.endsWith("Witch Ghost") && strip === "lick1") return "Eye roll"
	return FIDGET_BY_PET[pet.label]?.[strip] ?? FIDGET_NAMES[strip] ?? `Fidget ${i + 1}`
}

/** The four fidgets' animations, to name the tester's buttons (one per distinct animation). */
function useFidgets(look: number, enabled: boolean): Array<{ variant: number; label: string }> {
	const a = usePreviewFrames(enabled ? look : -1, "VARIANT", 0, 48)
	const b = usePreviewFrames(enabled ? look : -1, "VARIANT", 1, 48)
	const c = usePreviewFrames(enabled ? look : -1, "VARIANT", 2, 48)
	const d = usePreviewFrames(enabled ? look : -1, "VARIANT", 3, 48)
	const seen = new Set<string>()
	const out: Array<{ variant: number; label: string }> = []
	for (const [i, anim] of [a, b, c, d].entries()) {
		const label = fidgetName(look, anim?.strip, i)
		const key = anim?.strip ?? label
		if (seen.has(key)) continue
		seen.add(key)
		out.push({ variant: i, label })
	}
	return out
}

const POSES = [
	["IDLE", "Idle"], ["WALK", "Walk"], ["JUMP", "Jump"], ["HANG", "Hang"],
	["SPIN", "Spin"], ["HAPPY", "Happy"], ["SLEEP", "Sleep"], ["SAD", "Sad"],
	["SURPRISED", "Surprised"], ["DIZZY", "Dizzy"], ["SHAKE", "Shake"],
	["CHARGING", "Charging"], ["LOW_BATTERY", "Low battery"], ["REACTION", "Reaction"],
	["VARIANT", "Fidget"], ["LOOK", "Look around"], ["BLOW", "Bubbles"], ["OUTRO", "Exit"],
] as const

function AnimationTester({ look }: { look: number }) {
	const { View } = ReactNative
	const { Button, TableRow, TableRowGroup } = Design as any
	const [open, setOpen] = React.useState(false)
	const [pose, setPose] = React.useState<string>("SLEEP")
	const [variant, setVariant] = React.useState(0)
	const [replay, setReplay] = React.useState(0)
	const fidgets = useFidgets(look, open && pose === "VARIANT")
	React.useEffect(() => setVariant(0), [look])
	return <TableRowGroup title="Animation tester">
		<TableRow label={open ? "Close animation tester" : "Try each animation"}
			subLabel="Loop poses here without waiting for events. Movement and floating effects happen only on the live pet."
			onPress={() => setOpen(!open)} />
		{open ? <View style={{ gap: 12, padding: 16 }}>
			<FieldRow label={`${lookOf(look).label} · ${POSES.find(p => p[0] === pose)?.[1]}`}>
				<View style={{ alignItems: "center" }}>
					<Sprite key={`${look}:${pose}:${variant}:${replay}`} look={look} size={140} pose={pose} variant={variant} />
				</View>
			</FieldRow>
			<View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{POSES.map(([id, label]) => <Button key={id} size="md" variant={pose === id ? "primary" : "secondary"}
					text={label} onPress={() => { setPose(id); setVariant(0); setReplay(n => n + 1) }} />)}
			</View>
			{pose === "REACTION" ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{["Heart", "Alert", "Mail", "Music"].map((label, i) =>
					<Button key={i} size="md" variant={variant === i ? "primary" : "secondary"} text={label} onPress={() => setVariant(i)} />)}
			</View> : null}
			{pose === "VARIANT" && fidgets.length > 1 ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
				{fidgets.map(f =>
					<Button key={f.variant} size="md" variant={variant === f.variant ? "primary" : "secondary"} text={f.label} onPress={() => setVariant(f.variant)} />)}
			</View> : null}
		</View> : null}
	</TableRowGroup>
}

/** One pet in the strip: its idle animation and name; the chosen one has a ring round it. */
function PetThumb({ look, selected, onPress, onLayout }: { look: number; selected: boolean; onPress: () => void; onLayout?: (x: number) => void }) {
	const { Pressable } = ReactNative
	const { Text } = Design as any
	const pet = lookOf(look)
	const ring = token("BRAND_500", "#5865F2")
	return (
		<Pressable
			accessibilityRole="radio"
			accessibilityState={{ checked: selected }}
			accessibilityLabel={pet.label}
			onPress={onPress}
			onLayout={onLayout ? (e: any) => onLayout(e.nativeEvent.layout.x) : undefined}
			style={({ pressed }: { pressed: boolean }) => ({
				width: 76,
				alignItems: "center",
				paddingVertical: 6,
				paddingHorizontal: 2,
				borderRadius: 12,
				borderWidth: 2,
				borderColor: selected ? ring : "transparent",
				opacity: pressed ? 0.6 : 1,
			})}
		>
			<Sprite look={look} size={52} />
			<Text variant={selected ? "text-xxs/semibold" : "text-xxs/medium"} color={selected ? "text-default" : "text-muted"}
				numberOfLines={2} style={{ textAlign: "center", marginTop: 3, height: 26 }}>
				{pet.label}
			</Text>
		</Pressable>
	)
}

/** A collection's name, written upwards, at the start of its pets in the strip. */
function PackLabel({ label, onLayout }: { label: string; onLayout: (x: number) => void }) {
	const { View } = ReactNative
	const { Text } = Design as any
	return (
		<View onLayout={(e: any) => onLayout(e.nativeEvent.layout.x)} style={{ width: 18, height: 84, alignItems: "center", justifyContent: "center", marginLeft: 4 }}>
			<Text variant="text-xxs/bold" color="text-muted" numberOfLines={1}
				style={{ width: 84, textAlign: "center", letterSpacing: 0.8, transform: [{ rotate: "-90deg" }] }}>
				{label.toUpperCase()}
			</Text>
		</View>
	)
}

/** How far before the left edge (dp) a pinned name starts fading out for the next one. */
const PIN_FADE = 60

/**
 * The collection name stuck at the strip's left edge: the last one whose own name has scrolled past
 * it. Its own column, so pets never slide underneath, and its own state, so scrolling redraws only it.
 */
function PinnedLabel({ control }: { control: { current?: (label: string, opacity: number) => void } }) {
	const { View } = ReactNative
	const { Text } = Design as any
	const [pin, setPin] = React.useState({ label: "", opacity: 0 })
	control.current = (label, opacity) => setPin(old => (old.label === label && old.opacity === opacity ? old : { label, opacity }))
	return (
		<View style={{ width: 18, height: 84, alignItems: "center", justifyContent: "center", opacity: pin.opacity }}>
			<Text variant="text-xxs/bold" color="text-muted" numberOfLines={1}
				style={{ width: 84, textAlign: "center", letterSpacing: 0.8, transform: [{ rotate: "-90deg" }] }}>
				{pin.label.toUpperCase()}
			</Text>
		</View>
	)
}

/**
 * Every pet in one strip that scrolls sideways, each collection headed by its name written upwards.
 * A name that reaches the left edge stays there (PinnedLabel) and fades into the next as it arrives.
 * The collection buttons above jump the strip to a collection, and light up as it scrolls past.
 */
function PetStrip({ current, onChoose }: { current: number; onChoose: (look: number) => void }) {
	const { View, ScrollView } = ReactNative
	const { Button, TableRowGroup } = Design as any
	const { hiddenPacks } = useSettings()
	const strip = React.useRef<any>(null)
	const starts = React.useRef<Record<string, number>>({})
	const placed = React.useRef(false)
	const viewWidth = React.useRef(0)
	const pinControl = React.useRef<((label: string, opacity: number) => void) | undefined>(undefined)
	const visible = GROUPS.filter(g => !hiddenPacks.includes(g.id) && LOOKS.some(l => inGroup(l, GROUPS.indexOf(g))))
	const [active, setActive] = React.useState<string>(() => GROUPS[groupOf(current)].id)
	if (!visible.length) return null

	const jump = (id: string) => {
		setActive(id)
		// Just past the name, so it pins straight away.
		strip.current?.scrollTo?.({ x: (starts.current[id] ?? 0) + 1, animated: true })
	}
	const onScroll = (e: any) => {
		const scrolled = e.nativeEvent.contentOffset.x
		// Pinned: the last collection whose name has gone past the left edge; it fades out over the
		// last PIN_FADE dp before the next name gets there, and that one takes its place.
		let pin: (typeof visible)[number] | undefined
		let next: number | undefined
		for (const g of visible) {
			const at = starts.current[g.id]
			if (at === undefined) continue
			if (at < scrolled) pin = g
			else if (next === undefined) next = at - scrolled
		}
		const fade = next === undefined ? 1 : Math.min(1, Math.max(0, next / PIN_FADE))
		pinControl.current?.(pin?.label ?? "", pin ? Math.round(fade * 20) / 20 : 0)
		// The collection under the middle of the strip is the one lit up.
		const middle = scrolled + viewWidth.current / 2
		let here = visible[0].id
		for (const g of visible) if ((starts.current[g.id] ?? Infinity) <= middle) here = g.id
		if (here !== active) setActive(here)
	}

	return (
		// Inside a real row, like the other sections, so it sits on the row's surface under any theme.
		<TableRowGroup>
			<FieldRow label="Choose a pet">
			<View style={{ gap: 10 }}>
				<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
					{visible.map(g => (
						<Button key={g.id} size="sm" variant={g.id === active ? "primary" : "secondary"} text={g.label} onPress={() => jump(g.id)} />
					))}
				</ScrollView>
				<View style={{ flexDirection: "row", alignItems: "center" }}>
				<PinnedLabel control={pinControl} />
				<ScrollView ref={strip} horizontal showsHorizontalScrollIndicator={false} onScroll={onScroll} scrollEventThrottle={16}
					onLayout={(e: any) => { viewWidth.current = e.nativeEvent.layout.width }}
					style={{ flex: 1 }}
					contentContainerStyle={{ alignItems: "center", paddingRight: 6, gap: 2 }}>
					{visible.map(g => (
						<React.Fragment key={g.id}>
							<PackLabel label={g.label} onLayout={x => { starts.current[g.id] = x }} />
							{LOOKS.filter(l => inGroup(l, GROUPS.indexOf(g))).map(l => (
								<PetThumb key={l.id} look={l.id} selected={l.id === current} onPress={() => onChoose(l.id)}
									onLayout={l.id === current ? x => {
										// Opening the page: the chosen pet is in view, a little in from the edge.
										if (placed.current) return
										placed.current = true
										setTimeout(() => strip.current?.scrollTo?.({ x: Math.max(0, x - 80), animated: false }), 0)
									} : undefined} />
							))}
						</React.Fragment>
					))}
				</ScrollView>
				</View>
			</View>
			</FieldRow>
		</TableRowGroup>
	)
}

/** One group's pets as Discord radio rows: the fallback picker. */
function GroupList({ group, current, onChoose, title }: { group: number; current: number; onChoose: (look: number) => void; title?: string }) {
	const { TableRadioGroup, TableRadioRow } = Design as any
	const pets = LOOKS.filter(l => inGroup(l, group))
	return (
		<TableRadioGroup
			key={`${GROUPS[group].id}-${current}`}
			title={title}
			defaultValue={String(current)}
			onChange={(value: string) => onChoose(Number(value))}
		>
			{pets.map(l => (
				<TableRadioRow key={l.id} label={l.label} value={String(l.id)} />
			))}
		</TableRadioGroup>
	)
}

/** If the strip throws (a renamed prop, a missing export): every pack as its own plain list. */
function PlainPicker({ current, onChoose }: { current: number; onChoose: (look: number) => void }) {
	const { Stack } = Design as any
	const { hiddenPacks } = useSettings()
	return (
		<Stack spacing={24}>
			{GROUPS.map((g, i) => hiddenPacks.includes(g.id) ? null : (
				<GroupList key={g.id} group={i} current={current} onChoose={onChoose} title={g.label} />
			))}
		</Stack>
	)
}

function withFallback() {
	return class Boundary extends React.Component<{ current: number; onChoose: (look: number) => void }, { failed: boolean }> {
		state = { failed: false }
		static getDerivedStateFromError() {
			return { failed: true }
		}
		componentDidCatch(error: unknown) {
			reportError("[Sparkle] pet strip failed, using plain lists:", error)
		}
		render() {
			const { current, onChoose } = this.props
			if (this.state.failed) return <PlainPicker current={current} onChoose={onChoose} />
			return <PetStrip current={current} onChoose={onChoose} />
		}
	}
}

let Boundary: ReturnType<typeof withFallback> | undefined

/** Sheet pets (cats, dogs, seasonal): a one-pixel outline so they stand out against busy or dark chats. */
function OutlinePicker({ value }: { value: number }) {
	const { TableRadioGroup, TableRadioRow } = Design as any
	return (
		<TableRadioGroup
			key={`outline-${value}`}
			title="Outline"
			description="A thin border round the pet, so it's easier to see."
			defaultValue={String(value)}
			onChange={(v: string) => update({ outline: Number(v) })}
		>
			<TableRadioRow label="Automatic" subLabel="Light on dark themes, dark on light ones" value="1" />
			<TableRadioRow label="Light" value="2" />
			<TableRadioRow label="Dark" value="3" />
			<TableRadioRow label="Off" value="0" />
		</TableRadioGroup>
	)
}

let nameSave: ReturnType<typeof setTimeout> | undefined

/** The name field: saved once typing pauses (or the field is left), not on every letter. */
function NameField({ value, placeholder }: { value: string; placeholder: string }) {
	const { TextInput } = Design as any
	const [text, setText] = React.useState(value)
	React.useEffect(() => setText(value), [value])
	const save = (next: string) => {
		if (nameSave) clearTimeout(nameSave)
		nameSave = undefined
		if (next !== value) update({ name: next })
	}
	return (
		<FieldRow label="Name" description="What it calls itself in its speech bubbles.">
			<TextInput
				placeholder={placeholder}
				value={text}
				maxLength={24}
				returnKeyType="done"
				onChange={(next: string) => {
					setText(next)
					if (nameSave) clearTimeout(nameSave)
					nameSave = setTimeout(() => save(next), 500)
				}}
				onBlur={() => save(text)}
				onSubmitEditing={() => save(text)}
			/>
		</FieldRow>
	)
}

const PACKS_HINT = "Choose which collections appear in the picker. Your active pet stays."

/** Which pet, how big, what it's called and its outline; then the packs and the tester. */
export default function Pet() {
	const { Page } = components
	const { ScrollView, View } = ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow } = Design as any
	Boundary ??= withFallback()
	const Picker = Boundary

	const s = useSettings()
	const bottom = useBottomPadding()
	const pet = lookOf(s.look)
	const [managePacks, setManagePacks] = React.useState(false)

	/** Switching pets also switches a default name, but never one the user chose. */
	const choose = (look: number) => {
		const next = lookOf(look)
		const name = s.name?.trim() ?? ""
		const isDefault = !name || LOOKS.some(l => l.defaultName === name)
		update(isDefault ? { look, name: next.defaultName } : { look })
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TableRowGroup>
						<FieldRow label={pet.label} description={`${GROUPS[groupOf(s.look)].label} collection`}>
							<View style={{ alignItems: "center" }}>
								<Sprite look={s.look} size={140} />
							</View>
						</FieldRow>
					</TableRowGroup>

					<Picker current={s.look} onChoose={choose} />

					<SizeSlider value={s.sizeDp} kind={pet.kind} />

					<TableRowGroup title="Name">
						<NameField value={s.name} placeholder={pet.defaultName} />
					</TableRowGroup>

					{pet.kind === "cat" || pet.kind === "dog" || pet.kind === "seasonal" ? <OutlinePicker value={s.outline} /> : null}

					<TableRowGroup title="Pet packs">
						<TableRow label={managePacks ? "Close pack settings" : "Show or hide packs"}
							subLabel={GROUPS.every(g => s.hiddenPacks.includes(g.id)) ? "All packs hidden. Open to show a pack." : PACKS_HINT}
							onPress={() => setManagePacks(!managePacks)} />
						{managePacks ? GROUPS.map((g, i) => (
							<TableSwitchRow key={g.id} label={g.label}
								subLabel={`${LOOKS.filter(l => inGroup(l, i)).length} pets`}
								value={!s.hiddenPacks.includes(g.id)}
								onValueChange={(show: boolean) => update({ hiddenPacks: show ? s.hiddenPacks.filter(id => id !== g.id) : [...new Set([...s.hiddenPacks, g.id])] })} />
						)) : null}
					</TableRowGroup>

					<AnimationTester look={s.look} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
