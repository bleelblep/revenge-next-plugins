/**
 * A text field (or a few related ones) in a card, so it sits on the same background as the row
 * groups around it instead of floating on the page. Shared by every plugin; see
 * docs/plugin-design-language.md 3.6.
 *
 * `label` names the field (the row's label), `title` is an optional group heading, and the
 * explanation goes inside the row as muted text, so don't also pass `label` / `description` to the
 * TextInput. Error text stays on the TextInput (`status` + `errorMessage`).
 *
 * Not for search boxes above a list or fields inside an alert dialog: those stay bare.
 *
 * Call from inside a component's render: `revenge.*` is read here, so module scope is out
 * (docs/porting-rules.md rule 1).
 */
interface FieldRowProps {
	/** The row's label: names the field. */
	label: string
	/** Muted text under the field, inside the row. */
	description?: any
	children: any
}

/**
 * One field as a real TableRow: the field (and its explanation) is the row's `subLabel`, typed
 * ReactNode, so the row paints its background. Put several in one TableRowGroup for related fields.
 */
export function FieldRow({ label, description, children }: FieldRowProps) {
	const { View } = revenge.react.ReactNative
	const { TableRow, Text } = revenge.discord.design.Design as any
	// A row group paints nothing itself: each TableRow draws its own background, and themes recolour
	// rows through their own tokens (a Card drifted to a different shade under custom themes). So the
	// field goes inside a real row and gets the row's surface.
	return (
		<TableRow
			label={label}
			subLabel={
				<View style={{ gap: 8, marginTop: 8 }}>
					{children}
					{description ? (
						<Text variant="text-sm/normal" color="text-muted">
							{description}
						</Text>
					) : null}
				</View>
			}
		/>
	)
}

/** A group holding one field row, with an optional heading. */
export function FieldGroup({ title, ...row }: FieldRowProps & { title?: string }) {
	const { TableRowGroup } = revenge.discord.design.Design as any
	return (
		<TableRowGroup title={title}>
			<FieldRow {...row} />
		</TableRowGroup>
	)
}
