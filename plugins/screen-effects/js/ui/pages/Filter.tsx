import type { FilterStyle } from "../../native"
import { FILTER_OPTIONS, availableOptions, savedUnavailable } from "../options"
import { useBottomPadding } from "../safeArea"
import { TestPad } from "../testPad"
import { update, useNative, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

export default function Filter() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRadioGroup, TableRadioRow } = Design

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()
	const unsupported = native ? !native.supported : false
	const options = availableOptions(FILTER_OPTIONS, native, "filters")

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TestPad />
					<TableRadioGroup
						key={`${native?.rendererTier}:${options.map(o => o.value).join(",")}`}
						title="Screen filter"
						description={
							savedUnavailable(native, "filters", s.filter) ?? (unsupported
								? "Legacy overlays: CRT, old film, night vision, vaporwave, dreamy, VHS, frosted glass and rainbow puffs. These approximate the look without sampling Discord's pixels."
								: "Stays on over the whole app, under your tap effects. Videos and camera previews are drawn separately and keep their normal look."
							)
						}
						defaultValue={s.filter}
						onChange={(filter: FilterStyle) => update({ filter })}
					>
						{options.map(option => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								value={option.value}
							/>
						))}
					</TableRadioGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
