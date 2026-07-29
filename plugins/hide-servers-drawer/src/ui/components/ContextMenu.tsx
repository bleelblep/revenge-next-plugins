import type { MenuItem } from "../../lib/guildMenu"
import { dangerText, pressedOverlay, sheetBackdrop, sheetBackground, textMuted, textNormal } from "../theme"

const { Modal, Pressable, View, Text, StyleSheet } = revenge.react.ReactNative

/**
 * Fallback only -- GuildRow tries Discord's own action sheet first (lib/guildMenu.ts) for
 * pixel-identical chrome, custom themes included. This renders if that call isn't available
 * or throws, so it stays theme-aware too rather than assuming dark theme.
 */
export default function ContextMenu({
	visible,
	title,
	items,
	onClose,
}: {
	visible: boolean
	title: string
	items: MenuItem[]
	onClose: () => void
}) {
	if (!visible) return null

	return (
		<Modal transparent visible={visible} onRequestClose={onClose} statusBarTranslucent>
			<Pressable style={[st.backdrop, { backgroundColor: sheetBackdrop() }]} onPress={onClose}>
				<View style={[st.sheet, { backgroundColor: sheetBackground() }]}>
					<Text style={[st.title, { color: textMuted() }]} numberOfLines={1}>
						{title}
					</Text>
					{items.map((item, i) => (
						<Pressable
							key={i}
							style={({ pressed }: any) => [st.item, pressed && { backgroundColor: pressedOverlay() }]}
							onPress={() => {
								onClose()
								item.action()
							}}
						>
							<Text style={[st.itemText, { color: item.danger ? dangerText() : textNormal() }]}>
								{item.label}
							</Text>
						</Pressable>
					))}
				</View>
			</Pressable>
		</Modal>
	)
}

const st = StyleSheet.create({
	backdrop: { flex: 1, justifyContent: "center", padding: 24 },
	sheet: { borderRadius: 12, overflow: "hidden", minWidth: 220, alignSelf: "center" },
	title: { fontSize: 12, fontWeight: "700", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
	item: { paddingHorizontal: 16, paddingVertical: 12 },
	itemText: { fontSize: 15 },
})
