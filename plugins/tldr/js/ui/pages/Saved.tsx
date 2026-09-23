import { DEFAULTS } from '../../defaults'
import { getStorage } from '../../lib/state'
import { forgetSaved } from '../../lib/summarise'
import { rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SavedSummary, TldrStorage } from '../../types'

/** A summary costs money, so what was already paid for is kept and shown plainly. */
export default function Saved() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const {
		Stack,
		Text,
		TableRowGroup,
		TableRow,
		TextInput,
		AlertModal,
		AlertActionButton,
	} = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators

	const storage = getStorage()
	const s = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const set = (value: Partial<TldrStorage>) => storage?.set(value)
	const saved: SavedSummary[] = s.saved ?? []

	const when = (at: number) => {
		const mins = Math.max(0, Math.round((Date.now() - at) / 60000))
		if (mins < 1) return 'just now'
		if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
		const hours = Math.round(mins / 60)
		if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
		const days = Math.round(hours / 24)
		return `${days} day${days === 1 ? '' : 's'} ago`
	}

	const confirmForget = () => {
		const key = 'TldrForgetSaved'
		Alerts.openAlert(
			key,
			<AlertModal
				title="Forget saved summaries?"
				content={`${saved.length} summar${saved.length === 1 ? 'y' : 'ies'} will be deleted. Asking about those messages again will spend a call each.`}
				actions={
					<>
						<AlertActionButton
							text="Forget"
							variant="destructive"
							onPress={() => {
								Alerts.dismissAlert(key)
								forgetSaved()
							}}
						/>
						<AlertActionButton
							text="Cancel"
							variant="secondary"
							onPress={() => Alerts.dismissAlert(key)}
						/>
					</>
				}
			/>,
		)
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Every summary you ask for is kept on this device and survives closing
						Discord, so asking again about the same message is free. A message you
						edit is summarised again, because the text changed.
					</Text>

					{saved.length ? (
						<TableRowGroup
							title={`${saved.length} kept — newest first`}
							hasIcons
						>
							{[...saved]
								.reverse()
								.slice(0, 20)
								.map(entry => (
									<TableRow
										key={entry.key}
										label={entry.text.replace(/^[-\s]+/, '').slice(0, 60)}
										subLabel={when(entry.at)}
										icon={rowIcon('TextIcon', 'ic_text')}
									/>
								))}
						</TableRowGroup>
					) : (
						<Text color="text-muted" variant="text-sm/normal">
							Nothing saved yet. Long-press a long message and tap TL;DR.
						</Text>
					)}

					<TextInput
						label="Keep at most"
						placeholder={`${DEFAULTS.keep}`}
						description="Older summaries are dropped first once there are more than this."
						value={`${s.keep}`}
						trailingText="summaries"
						returnKeyType="done"
						onChange={value => {
							const parsed = Number.parseInt(value.replace(/\D/g, ''), 10)
							set({ keep: Number.isFinite(parsed) && parsed >= 1 ? parsed : DEFAULTS.keep })
						}}
					/>

					<TableRowGroup hasIcons>
						<TableRow
							label="Forget them all"
							subLabel="Asking about those messages again will cost a call each"
							icon={rowIcon('TrashIcon', 'ic_trash_24px')}
							variant="danger"
							disabled={!saved.length}
							onPress={confirmForget}
						/>
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
