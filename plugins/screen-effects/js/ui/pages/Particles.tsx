import type { ParticleStyle } from "../../native"
import { CustomParticlesInput } from "../customInput"
import { PARTICLE_OPTIONS } from "../options"
import { useBottomPadding } from "../safeArea"
import { TestPad } from "../testPad"
import { update, useNative, useSettings } from "../state"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

export default function Particles() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRadioGroup, TableRadioRow } = Design

	const s = useSettings()
	const native = useNative()
	const bottom = useBottomPadding()

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: bottom }}>
				<Stack spacing={24}>
					<TestPad />
					<TableRadioGroup
						title="Particles"
						description="Drawn on top of the screen, so they work on every Android version."
						defaultValue={s.particles}
						onChange={(particles: ParticleStyle) => update({ particles })}
					>
						{PARTICLE_OPTIONS.map(option => (
							<TableRadioRow
								key={option.value}
								label={option.label}
								subLabel={option.subLabel}
								value={option.value}
							/>
						))}
					</TableRadioGroup>

					{s.particles === "custom" && (
						<CustomParticlesInput
							label="Custom particles"
							description="Type emoji straight from your keyboard, :shortcodes: for standard or server emoji, or paste image links. Each tap throws a random mix."
							saved={s.customInput}
							loaded={native?.customLoaded}
							onApply={(customInput, custom) => update({ customInput }, { custom })}
						/>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
