import { setFolderHidden } from "../../lib/hidden"
import { refresh as refreshSortedGuilds } from "../../patches/sortedGuilds"
import { folderTint } from "../theme"
import ContextMenu from "./ContextMenu"
import GuildRow, { useSelectedGuildId } from "./GuildRow"
import GuildIcon from "./GuildIcon"

// revenge.utils.toast.show doesn't exist -- was a guess, confirmed wrong on-device
// ("Cannot read property 'show' of undefined" at preInit). ToastActionCreators.open is
// confirmed live from revenge-bundle-next's own source (used by the staff-settings and
// developer-kit internal plugins).
function showToast(content: string) {
	revenge.discord.actions.ToastActionCreators.open({ key: "HideServersDrawerToast", content })
}
// getAssetIdByName (lowercase "d"), under revenge.assets not revenge.components -- confirmed

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
// Read per call, never at module scope -- see docs/porting-rules.md rule 1.
const stores = () => revenge.discord.flux.Stores

// getModules, not lookupModule: confirmed on-device (staff-tags plugin) that a lazily-loaded
// module can still be unregistered even from inside start() -- this file's top-level code
// runs at preInit (the whole plugin bundle executes together), before Discord's module
// registry is populated. lookupModule gives up immediately and permanently caches a false
// "not found"; getModules subscribes and calls back whenever the module actually loads.
let guildActions: any
revenge.modules.finders.getModules<any>(revenge.modules.finders.filters.withProps("toggleGuildFolderExpand"), mod => {
	guildActions = mod
})

const ICON = 48
const MINI = 16
// `revenge.assets` itself is a plain object and safe to read early, but *calling* it at module
// scope is not: the asset registry isn't populated at preInit, so the lookup would return
// undefined and be frozen that way for the session. Resolved on first render instead.
let folderAsset: number | undefined
function folderAssetId() {
	if (folderAsset === undefined) {
		const { getAssetIdByName } = revenge.assets
		folderAsset = getAssetIdByName("FolderIcon") ?? getAssetIdByName("ic_folder")
	}
	return folderAsset
}

const POS = [
	{ top: 6, left: 6 },
	{ top: 6, right: 6 },
	{ bottom: 6, left: 6 },
	{ bottom: 6, right: 6 },
]

function useFolderExpanded(folderId: string | number): boolean {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { React } = revenge.react
	const { ExpandedGuildFolderStore } = stores()

	const [open, setOpen] = React.useState(() => {
		try {
			const folders = ExpandedGuildFolderStore?.getExpandedFolders?.()
			return folders instanceof Set ? folders.has(folderId) : false
		} catch {
			return false
		}
	})

	React.useEffect(() => {
		if (!ExpandedGuildFolderStore?.addChangeListener) return
		const onChange = () => {
			try {
				const folders = ExpandedGuildFolderStore.getExpandedFolders?.()
				setOpen(folders instanceof Set ? folders.has(folderId) : false)
			} catch {
				/* ignore */
			}
		}
		ExpandedGuildFolderStore.addChangeListener(onChange)
		return () => ExpandedGuildFolderStore.removeChangeListener?.(onChange)
	}, [folderId])

	return open
}

/** node: { type: "folder", id, name, color, children: [{ id, ... }] } from SortedGuildStore.getGuildsTree(). */
export default function FolderRow({ node }: { node: any }) {
	const { React } = revenge.react
	const { Pressable, View, Image } = revenge.react.ReactNative

	const open = useFolderExpanded(node.id)
	const selectedId = useSelectedGuildId()
	const children: any[] = Array.isArray(node.children) ? node.children : []
	const tint = folderTint(node.color)
	const [menuOpen, setMenuOpen] = React.useState(false)

	const toggle = () => {
		try {
			guildActions?.toggleGuildFolderExpand?.(node.id)
		} catch {
			/* ignore */
		}
	}

	// No stock equivalent to borrow, so no native-action-sheet attempt here (unlike
	// GuildRow) -- straight to the fallback modal. A hidden folder disappears from the bar
	// entirely (same as a hidden guild), so it can only be unhidden from Settings, not
	// re-found here to toggle back off.
	const openMenu = React.useCallback(() => {
		try {
			revenge.discord.haptics.trigger("impactMedium")
		} catch {
			/* haptics API is unconfirmed; ignore if unavailable */
		}
		setMenuOpen(true)
	}, [])

	const hideFolder = () => {
		setFolderHidden(node.id, true)
		refreshSortedGuilds()
		showToast(`Hid folder "${node.name ?? "Folder"}"`)
	}

	const menu = (
		<ContextMenu
			visible={menuOpen}
			title={node.name || "Folder"}
			items={[{ label: "Hide folder", danger: true, action: hideFolder }]}
			onClose={() => setMenuOpen(false)}
		/>
	)

	if (open) {
		// Discord groups an expanded folder's rows inside a rounded, tinted backdrop rather
		// than leaving them floating loose in the list.
		return (
			<View
				style={{
					alignItems: "center",
					backgroundColor: `${tint}33`,
					borderRadius: 20,
					paddingVertical: 10,
				}}
			>
				<Pressable
					onPress={toggle}
					onLongPress={openMenu}
					delayLongPress={450}
					style={{ marginBottom: children.length ? 10 : 0 }}
				>
					<View
						style={{
							width: ICON,
							height: ICON,
							borderRadius: 16,
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: tint,
						}}
					>
						<Image source={folderAssetId() as any} style={{ width: 24, height: 24, tintColor: "#fff" }} />
					</View>
				</Pressable>
				{children.map((child, i) => (
					<View key={child.id} style={{ marginBottom: i === children.length - 1 ? 0 : 10 }}>
						<GuildRow id={String(child.id)} selected={String(child.id) === selectedId} />
					</View>
				))}
				{menu}
			</View>
		)
	}

	return (
		<>
			<Pressable onPress={toggle} onLongPress={openMenu} delayLongPress={450}>
				<View style={{ width: ICON, height: ICON }}>
					<View
						style={{
							width: ICON,
							height: ICON,
							borderRadius: 16,
							overflow: "hidden",
							backgroundColor: tint,
						}}
					>
						{children.slice(0, 4).map((child, i) => {
							let guild: any
							try {
								guild = stores().GuildStore?.getGuild?.(String(child.id))
							} catch {
								/* ignore */
							}
							if (!guild) return null
							return (
								<View
									key={child.id}
									style={{ position: "absolute", width: MINI, height: MINI, borderRadius: 8, overflow: "hidden", ...POS[i] }}
								>
									<GuildIcon guild={guild} size={MINI} radius={8} />
								</View>
							)
						})}
					</View>
				</View>
			</Pressable>
			{menu}
		</>
	)
}
