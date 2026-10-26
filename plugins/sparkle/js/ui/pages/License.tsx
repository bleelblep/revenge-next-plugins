import { useBottomPadding } from "../safeArea"
import * as components from "@revenge-mod/components"
import { Design } from "@revenge-mod/discord/design"
import * as ReactNative from "react-native"

/** Attribution, on its own route so the root page stays an index. */
export default function License() {
	const { Page } = components
	const { ScrollView } = ReactNative
	const { Stack, TableRowGroup, TableRow } = Design as any

	return (
		<Page>
			<ScrollView contentContainerStyle={{ paddingBottom: useBottomPadding() }}>
				<Stack spacing={24}>
					<TableRowGroup title="Licence">
						<TableRow label="Shimeji" subLabel="CC0-1.0, public domain. The Nyan Cat and Gary assets below are not." />
					</TableRowGroup>
					<TableRowGroup title="Art">
						<TableRow label="Unicorn" subLabel="Sprites provided by the plugin's author." />
						<TableRow
							label="Gary the Snail"
							subLabel="SpongeBob SquarePants Screensaver artwork, uploaded by toniophx to The Spriters Resource. Re-posed from its original parts. Original copyrighted artwork."
						/>
						<TableRow
							label="Cats and dogs"
							subLabel="Pet Cats Pack and Pet Dogs Pack by LuizMelo (luizmelo.itch.io). CC0, public domain."
						/>
						<TableRow
							label="Seasonal pets"
							subLabel="Ghost (LetargicDev), 16x Turkeys (Viergacht) and Flappy Dragon (bevouliin.com), OpenGameArt. CC0, public domain. Snowman Character by pechvogel, CC-BY 3.0."
						/>
						<TableRow
							label="Nyan Cat"
							subLabel="The character is by Chris Torres. The frames come from iliana's HTML5 Nyan Cat, as SVG by Gowee (nyancat-svg); every pose is built from their parts. For personal use on this phone only."
						/>
						<TableRow
							label="Nyan Cat song"
							subLabel="Nyanyanyanyanyanyanya! by daniwell, as recorded in iliana's HTML5 Nyan Cat. Played in the Nyan party. For personal use on this phone only."
						/>
					</TableRowGroup>
					<TableRowGroup title="Sounds">
						<TableRow
							label="Gary's voice"
							subLabel="Original Gary recordings from SpongeBob SquarePants: Battle for Bikini Bottom (PS2), uploaded by Sandmanfan to The Sounds Resource. Original copyrighted game audio."
						/>
						<TableRow
							label="Juhani Junkala"
							subLabel="The Essential Retro Video Game Sound Effects Collection. CC0, public domain."
						/>
						<TableRow label="Kenney" subLabel="Interface Sounds, Impact Sounds and Digital Audio. CC0, public domain." />
						<TableRow label="Mixkit" subLabel="The throw swoosh. Mixkit Sound Effects Free License." />
						<TableRow
							label="Kerzoven, AntumDeluge"
							subLabel="The cats' purrs and meows: Cat Purr & Meow and Kitten Mew, OpenGameArt. CC0, public domain."
						/>
						<TableRow label="Brandon Morris" subLabel="The dogs' barks: Dog barking mono, OpenGameArt. CC0, public domain." />
					</TableRowGroup>
					<TableRowGroup title="Credits">
						<TableRow
							label="Inspiration"
							subLabel={
								'The behaviour follows the exteraGram pet "Clawd" by @itskotovski: tapping, petting, throwing, peeking, shaking. This is a fresh implementation; no code or text from it is used.'
							}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
