import { isEmpty, instant } from "../lib/hidden"
import CustomGuildsBar from "../ui/components/CustomGuildsBar"
import { registerIntercept, unregisterIntercept } from "./createElementIntercept"

const { lookupModules } = revenge.modules.finders
const { withTypeName } = revenge.modules.finders.filters

// Nulling individual guild-bar rows leaves the row in the virtualized list's geometry -- the
// bar keeps a phantom slot and tapping a server jumps the scroll position, because a
// virtualized list still reserves layout for every entry in its data array, blank or not.
// There is no prop or override that removes an item from that geometry short of it never
// being in the array the list sees.
//
// So this patches the bar itself, not its rows: when anything is hidden, swap GuildsBar for
// a plain, non-virtualized render (see ui/components/CustomGuildsBar) built from
// SortedGuildStore.getGuildsTree(), which patches/sortedGuilds.ts already filters. A hidden
// guild is simply absent from that array -- nothing reserves a slot for it, so there is no
// gap and no scroll jump. When nothing is hidden, the real GuildsBar renders untouched.
export default function patchGuildsBar(): () => void {
	const patches: Array<() => void> = []

	let bars: any[] = []
	try {
		bars = lookupModules<any>(withTypeName("GuildsBar")) ?? []
	} catch {
		return () => {}
	}

	for (const bar of bars) {
		if (!bar) continue

		const original = bar.type

		try {
			patches.push(
				revenge.patcher.instead(bar, "type", (args: any[], callOriginal: any) => {
					if (isEmpty() || !instant()) return callOriginal.apply(bar, args)
					return revenge.react.React.createElement(CustomGuildsBar, null)
				}),
			)
		} catch {
			continue
		}

		// Belt-and-suspenders: if a closure captured `original` before this patch applied and
		// constructs it directly via React.createElement, catch it there too. See
		// createElementIntercept.ts for why `instead` alone isn't guaranteed to cover that.
		if (typeof original === "function") {
			try {
				const fallback = (props: any) =>
					isEmpty() || !instant()
						? revenge.react.React.createElement(original, props)
						: revenge.react.React.createElement(CustomGuildsBar, null)

				registerIntercept(original, fallback)
				patches.push(() => unregisterIntercept(original))
			} catch {
				/* the instead() patch above still covers the common path */
			}
		}
	}

	return () => patches.forEach(unpatch => { try { unpatch() } catch { /* already gone */ } })
}
