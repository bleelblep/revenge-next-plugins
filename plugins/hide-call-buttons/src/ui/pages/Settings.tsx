import { DEFAULTS, type HideCallButtonsStorage } from "../../index"

export default function Settings({
	api,
}: {
	api: RevengePluginStartApi<HideCallButtonsStorage>
}) {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const { Stack, TableRowGroup, TableSwitchRow } = revenge.discord.design.Design
	const { TableRowAssetIcon } = revenge.components

	const s = api.jsonStorage.use() ?? DEFAULTS
	const set = (patch: Partial<HideCallButtonsStorage>) => api.jsonStorage.set(patch)

	return (
		<Page>
			<ScrollView>
				<Stack spacing={24}>
					<TableRowGroup title="User profile">
						<TableSwitchRow
							label="Hide call button"
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							value={!!s.upHideVoiceButton}
							onValueChange={v => set({ upHideVoiceButton: v })}
						/>
						<TableSwitchRow
							label="Hide video button"
							icon={<TableRowAssetIcon name="VideoIcon" />}
							value={!!s.upHideVideoButton}
							onValueChange={v => set({ upHideVideoButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="DMs">
						<TableSwitchRow
							label="Hide call button"
							icon={<TableRowAssetIcon name="PhoneCallIcon" />}
							value={!!s.dmHideCallButton}
							onValueChange={v => set({ dmHideCallButton: v })}
						/>
						<TableSwitchRow
							label="Hide video button"
							icon={<TableRowAssetIcon name="VideoIcon" />}
							value={!!s.dmHideVideoButton}
							onValueChange={v => set({ dmHideVideoButton: v })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Voice channels">
						<TableSwitchRow
							label="Hide video button"
							icon={<TableRowAssetIcon name="VideoIcon" />}
							value={!!s.hideVCVideoButton}
							onValueChange={v => set({ hideVCVideoButton: v })}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
