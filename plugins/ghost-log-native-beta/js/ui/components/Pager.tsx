import {
	pagerBackground,
	pagerIndicatorBackground,
	pagerIndicatorBorder,
	pagerIndicatorText,
	pagerText,
} from '../theme'

/**
 * The 3-slot `Prev | Page x/y | Next` row shared by the log pages. Render it only when there is more
 * than one page. Disabled ends are dimmed by the theme helpers.
 */
export default function Pager({
	page,
	totalPages,
	onChange,
}: {
	page: number
	totalPages: number
	onChange: (page: number) => void
}) {
	const { View, Text, Pressable } = revenge.react.ReactNative
	const { Card } = revenge.discord.design.Design

	const atStart = page <= 1
	const atEnd = page >= totalPages
	const slot = { flex: 1, minHeight: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } as const

	return (
		<Card variant="secondary" border="none">
			<View style={{ flexDirection: 'row', padding: 10, gap: 8 }}>
				<Pressable
					onPress={() => !atStart && onChange(page - 1)}
					disabled={atStart}
					style={{ ...slot, backgroundColor: pagerBackground(atStart) }}
				>
					<Text style={{ color: pagerText(atStart), fontWeight: '700' }}>Prev</Text>
				</Pressable>

				<View
					style={{
						...slot,
						backgroundColor: pagerIndicatorBackground(),
						borderWidth: 1,
						borderColor: pagerIndicatorBorder(),
					}}
				>
					<Text style={{ color: pagerIndicatorText(), fontWeight: '700' }}>{`Page ${page}/${totalPages}`}</Text>
				</View>

				<Pressable
					onPress={() => !atEnd && onChange(page + 1)}
					disabled={atEnd}
					style={{ ...slot, backgroundColor: pagerBackground(atEnd) }}
				>
					<Text style={{ color: pagerText(atEnd), fontWeight: '700' }}>Next</Text>
				</Pressable>
			</View>
		</Card>
	)
}
