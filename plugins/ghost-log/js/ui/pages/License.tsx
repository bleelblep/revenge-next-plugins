import { useBottomPadding } from "../safeArea"

/**
 * Attribution, on its own route so the root page stays an index. Same split as
 * screenshot-redactor-dev's Visuals/Debug pages. Rendered as a plain navigator route, so
 * there's no plugin `api` prop here.
 */
export default function License() {
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableRow } = revenge.discord.design.Design

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Licence">
						<TableRow
							label="Ghost Log"
							subLabel="CC0-1.0 — public domain."
						/>
						<TableRow
							label="Visual indicator technique"
							subLabel="Adapted from redstonekasi's message-logger (BSD-3-Clause). See repo for NOTICE.md."
						/>
						<TableRow
							label="Delete interception &amp; storage"
							subLabel="Based on bleelblep's Anti Ghost Ping (CC0-1.0)."
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
