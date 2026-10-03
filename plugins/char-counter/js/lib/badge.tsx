/**
 * The count, in a small floating square just above the message box, on the left or right.
 *
 * Drawn by the chat input itself (`modules/chat_input/native/ChatInput.tsx`, 348.5): its render
 * returns a container (`collapsable: false`, `onLayout`, a long children array) holding the fade,
 * the message box and the accessories above it. The square is appended to that container,
 * absolutely placed from its top edge (`bottom: '100%'`), so it floats without making anything
 * taller. When the "…is typing" line is showing (the container then holds Discord's solid typing
 * fill: `pointerEvents: 'none'`, absolute-fill, a background), the square moves up above it.
 */

import { type CharCounterStorage, FONT_SIZE } from '../index'
import { limit, useLength } from './length'
import { wrapRender } from './wrapRender'

const PATH = 'modules/chat_input/native/ChatInput.tsx'
const GAP = 8
/** Roughly the "…is typing" line's height, so the square clears it. */
const TYPING_LINE = 26

export const badgeStatus = { hooked: false, moduleId: -1, lastError: '', placed: false }

function flatten(style: unknown): Record<string, any> {
	try {
		return revenge.react.ReactNative.StyleSheet.flatten(style as any) ?? {}
	} catch {
		return {}
	}
}

function isContainer(node: any): boolean {
	const props = node?.props
	return !!props && props.collapsable === false && typeof props.onLayout === 'function' && Array.isArray(props.children)
}

function isTypingFill(node: any): boolean {
	const props = node?.props
	if (!props || props.pointerEvents !== 'none' || props.children != null || !props.style) return false
	const style = flatten(props.style)
	return style.position === 'absolute' && style.top === 0 && style.bottom === 0 && style.backgroundColor != null
}

function find(root: any, predicate: (node: any) => boolean, depth = 0): any {
	if (!root || typeof root !== 'object' || depth > 25) return undefined
	if (!Array.isArray(root) && predicate(root)) return root
	const children = Array.isArray(root) ? root : root.props?.children
	if (Array.isArray(children)) {
		for (const child of children) {
			const found = find(child, predicate, depth + 1)
			if (found) return found
		}
	} else if (children && typeof children === 'object') {
		return find(children, predicate, depth + 1)
	}
	return undefined
}

/** A colour by token name through the theme in use, as hide-servers-drawer's `theme.ts`. */
function token(name: string, fallback: string): string {
	try {
		const tables = (revenge.discord.common as any).tokens?.Tokens
		const store = (revenge.discord.flux.Stores as any).ThemeStore
		const theme = store?.theme ?? 'darker'
		const semantic = tables?.SemanticColor?.[name]
		const entry = semantic?.[theme] ?? semantic?.darker ?? semantic?.dark
		const raw = entry?.raw ? tables?.RawColor?.[entry.raw] : undefined
		return typeof raw === 'string' ? raw : fallback
	} catch {
		return fallback
	}
}

/** 4000 -> "4,000". Hermes' toLocaleString doesn't always group, so done by hand. */
function grouped(n: number): string {
	return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function characters(n: number): string {
	return `${grouped(n)} ${n === 1 ? 'character' : 'characters'}`
}

function label(length: number, max: number, show: CharCounterStorage['show']): string {
	if (length > max) return `${characters(length - max)} over the limit`
	if (show === 'left') return `${characters(max - length)} left`
	if (show === 'limit') return `${grouped(length)} / ${characters(max)}`
	return characters(length)
}

/** The square's text size, clamped, from settings stored before there was one too. */
export function fontSizeOf(s: Partial<CharCounterStorage>): number {
	const size = Number(s.fontSize)
	return Number.isFinite(size) ? Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Math.round(size))) : FONT_SIZE.default
}

/** The square itself, shared with the settings page's preview. */
export function CounterSquare({ text, colour, fontSize }: { text: string; colour: string; fontSize: number }) {
	const { View } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design as any
	return (
		<View
			style={{
				minWidth: 32,
				// 28 dp at 12 pt, as before, growing with the text.
				minHeight: Math.round(fontSize * 1.34) + 12,
				paddingHorizontal: 8,
				paddingVertical: 4,
				borderRadius: 8,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: token('MOBILE_CHATINPUT_BACKGROUND_DEFAULT', '#222327'),
				elevation: 4,
			}}
		>
			<Text
				variant="text-xs/semibold"
				color={colour}
				lineClamp={1}
				style={{ fontSize, lineHeight: Math.round(fontSize * 1.34) }}
			>
				{text}
			</Text>
		</View>
	)
}

function Badge({ settings, typing }: { settings: () => CharCounterStorage; typing: boolean }) {
	const length = useLength()
	const s = settings()
	const max = limit()
	if (length <= 0) return null
	if (s.onlyNearLimit && length < max * 0.9) return null

	const { View } = revenge.react.ReactNative
	const over = length > max
	const near = length >= max * 0.9
	const side = s.side === 'right' ? { right: 16 } : { left: 16 }

	return (
		<View
			pointerEvents="none"
			style={{
				position: 'absolute',
				bottom: '100%',
				marginBottom: GAP + (typing ? TYPING_LINE : 0),
				...side,
			}}
		>
			<CounterSquare
				text={label(length, max, s.show)}
				// The colours Discord's own counter uses past the limit, and its warning shade before.
				colour={over ? 'text-feedback-critical' : near ? 'text-feedback-warning' : 'text-muted'}
				fontSize={fontSizeOf(s)}
			/>
		</View>
	)
}

export function patchBadge(settings: () => CharCounterStorage): () => void {
	return wrapRender(PATH, badgeStatus, original =>
		function ChatInputWithCounter(props: any, ref: any) {
			const tree = original(props, ref)
			try {
				const container = find(tree, isContainer)
				if (container) {
					const typing = container.props.children.some((child: any) => isTypingFill(child))
					const React = revenge.react.React
					container.props.children = [
						...container.props.children,
						React.createElement(Badge, { key: 'char-counter', settings, typing }),
					]
					badgeStatus.placed = true
				}
			} catch (error) {
				badgeStatus.lastError = `place: ${(error as Error)?.message ?? error}`
			}
			return tree
		},
	)
}
