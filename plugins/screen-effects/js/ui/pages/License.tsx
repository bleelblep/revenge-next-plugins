import { useBottomPadding } from "../safeArea"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/** Attribution, on its own route so the root page stays an index (Ghost Log Native Beta's pattern). */
export default function License() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Licence">
						<TableRow label="VFX" subLabel="CC0-1.0 — public domain, apart from the file below." />
						<TableRow
							label="Ripple effect"
							subLabel="Ported from Telegram for Android's SuperRipple (GPL-2.0-or-later). Ripple.kt carries that licence."
						/>
						<TableRow label="Sounds" subLabel="By Kenney (www.kenney.nl), CC0 1.0." />
					</TableRowGroup>
					<TableRowGroup title="Credits">
						<TableRow
							label="Idea"
							subLabel={'exteraGram\'s "Animated touches" by @jaxbastard and @zwylair. No code from it is used.'}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
