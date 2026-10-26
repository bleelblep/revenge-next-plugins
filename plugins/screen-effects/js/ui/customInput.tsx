import { type CustomItem } from "../native"
import { parseCustom } from "../emoji"
import { FieldGroup } from "./fieldGroup"
import { rowIcon } from "./icon"
import { refreshNative } from "./state"
import { Design } from "@revenge-mod/discord/design"
import * as React from "react"

function describe(parsed: ReturnType<typeof parseCustom>): string {
	const emoji = parsed.items.filter(i => i.type === "text").length
	const parts = [
		emoji && `${emoji} emoji group${emoji === 1 ? "" : "s"}`,
		parsed.serverEmoji && `${parsed.serverEmoji} server emoji`,
		parsed.links && `${parsed.links} image link${parsed.links === 1 ? "" : "s"}`,
	].filter(Boolean)
	const found = parts.length ? `Found ${parts.join(", ")}.` : "Nothing to throw yet."
	return parsed.missing.length ? `${found} Not found: ${parsed.missing.join(" ")}` : found
}

/**
 * The Custom particles box: emoji, :shortcodes: and image links, resolved here (only JS can look up
 * server emoji) and handed to native on "Use these". Shared by Particles (taps) and Power mode, which
 * keep separate lists.
 */
export function CustomParticlesInput({
	label,
	description,
	saved,
	loaded,
	onApply,
}: {
	label: string
	description: string
	/** The input as last saved. */
	saved: string
	/** How many sprites native has ready, or undefined before it has answered. */
	loaded: number | undefined
	onApply: (input: string, items: CustomItem[]) => void
}) {
	const { Stack, Text, TableRowGroup, TableRow, TextInput } = Design

	const [draft, setDraft] = React.useState(saved)
	const parsed = React.useMemo(() => parseCustom(draft), [draft])
	const dirty = draft !== saved

	const apply = () => {
		onApply(draft, parsed.items)
		// Images download in the background; check back so the loaded count catches up.
		setTimeout(refreshNative, 2500)
	}

	return (
		<Stack spacing={12}>
			<FieldGroup label={label} description={description}>
				<TextInput placeholder="🔥✨ :pog: :heart:" value={draft} returnKeyType="done" onChange={setDraft} />
				<Text color={parsed.missing.length ? "text-feedback-warning" : "text-muted"} variant="text-sm/normal">
					{describe(parsed)}
				</Text>
			</FieldGroup>
			<TableRowGroup hasIcons>
				<TableRow
					label={dirty ? "Use these" : "In use"}
					subLabel={
						dirty
							? "Save them and load them in."
							: loaded !== undefined
								? `${loaded} ready. Animated server emoji show as a still image.`
								: undefined
					}
					icon={rowIcon("ReactionIcon", "StarIcon")}
					disabled={!dirty}
					onPress={apply}
				/>
			</TableRowGroup>
		</Stack>
	)
}
