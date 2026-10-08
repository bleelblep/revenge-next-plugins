import { confirmDestructive } from '../../../../../shared/ui/confirm'
import { getAi, getStorage, useSettings } from '../../lib/state'
import { aiReady, allStyles, type CustomStyle, newStyleId, PRESETS, restyle, type Style } from '../../lib/styles'
import { showToast } from '../../lib/toast'
import { FieldRow } from '../fieldGroup'
import { dangerIcon, rowIcon } from '../icon'
import { useBottomPadding } from '../safeArea'
import type { SendTweaksStorage } from '../../types'

/**
 * Styles: what Restyle in the swipe-up Preview offers (`lib/styles.ts`), a box to try them without
 * sending anything, and your own styles. Built-in styles start switched off (`enabledStyles`). Registered always: Pig Latin works without AI Core.
 */
export default function Styles() {
	// Read per-render, never at module scope -- see docs/porting-rules.md rule 1.
	const { Page } = revenge.components
	const { ScrollView } = revenge.react.ReactNative
	const React = revenge.react.React
	const { Stack, Text, TableRowGroup, TableRow, TableSwitchRow, TextInput } = revenge.discord.design.Design

	const storage = getStorage()
	const s = useSettings()
	const set = (patch: Partial<SendTweaksStorage>) => storage?.set(patch)
	const hasAi = !!getAi()

	const [draft, setDraft] = React.useState('')
	const [result, setResult] = React.useState<{ style: string; text: string } | undefined>()
	const [running, setRunning] = React.useState<string | undefined>()

	const [editing, setEditing] = React.useState<string | undefined>()
	const [name, setName] = React.useState('')
	const [prompt, setPrompt] = React.useState('')

	const custom = s.customStyles ?? []
	const enabled = new Set(s.enabledStyles ?? [])
	// Every style can be tried here, switched on or not, so you can pick before turning one on.
	const usable = [...PRESETS, ...allStyles({ customStyles: s.customStyles })].filter(style => style.local || hasAi)

	const tryStyle = async (style: Style) => {
		if (!draft.trim() || running) return
		setRunning(style.id)
		try {
			const out = await restyle(draft, style)
			if (out.ok) setResult({ style: style.name, text: out.text })
			else showToast(out.error, { key: 'SendTweaksStyles' })
		} finally {
			setRunning(undefined)
		}
	}

	const resetForm = () => {
		setEditing(undefined)
		setName('')
		setPrompt('')
	}

	const save = () => {
		const style: CustomStyle = { id: editing ?? newStyleId(), name: name.trim(), prompt: prompt.trim() }
		if (!style.name || !style.prompt) return
		// Arrays are written whole (types.ts), so a deleted style stays deleted.
		set({
			customStyles: editing
				? custom.map(existing => (existing.id === editing ? style : existing))
				: [...custom, style],
		})
		showToast(editing ? `Saved ${style.name}` : `Added ${style.name}`, { key: 'SendTweaksStyles' })
		resetForm()
	}

	const remove = () => {
		const target = custom.find(style => style.id === editing)
		if (!target) return
		confirmDestructive({
			title: `Delete ${target.name}?`,
			body: "It's removed from Restyle. This can't be undone.",
			action: 'Delete',
			onConfirm: () => {
				set({ customStyles: custom.filter(style => style.id !== target.id) })
				resetForm()
			},
		})
	}

	const togglePreset = (id: string, on: boolean) => {
		const next = new Set(enabled)
		if (on) next.add(id)
		else next.delete(id)
		// In PRESETS order, so the picker lists them the same way as this page.
		set({ enabledStyles: PRESETS.map(style => style.id).filter(styleId => next.has(styleId)) })
	}

	return (
		<Page>
			<ScrollView
				keyboardShouldPersistTaps="handled"
				contentContainerStyle={{ paddingBottom: useBottomPadding() }}
			>
				<Stack spacing={24}>
					<Text color="text-muted" variant="text-sm/normal">
						Switch on the styles you want below. Then hold send and swipe up to Preview, tap
						Restyle and pick one. The preview
						shows the rewritten message, and nothing is sent until you tap Send. Links,
						mentions, emoji and code are kept exactly as you typed them.
						{hasAi
							? ' AI styles send the message to the provider set up in AI Core, one call per restyle.'
							: ' Pig Latin works on your phone. Install AI Core for the other styles.'}
					</Text>

					<TableRowGroup title="Try a style">
						<FieldRow label="Message" description="Nothing typed here is sent anywhere except AI Core.">
							<TextInput
								placeholder="Type a message, then tap a style"
								value={draft}
								multiline
								isClearable
								onChange={(value: string) => {
									setDraft(value)
									setResult(undefined)
								}}
							/>
						</FieldRow>
						{result ? (
							<TableRow label={result.style} subLabel={result.text} />
						) : null}
						{usable.map(style => (
							<TableRow
								key={style.id}
								label={running === style.id ? `${style.name}…` : style.name}
								subLabel={style.description}
								disabled={!draft.trim() || (!!running && running !== style.id) || (!style.local && !aiReady())}
								onPress={() => tryStyle(style)}
							/>
						))}
					</TableRowGroup>

					<Text color="text-muted" variant="text-sm/normal">
						Built-in styles are all off to start with. Only the ones you switch on, and your
						own, appear in Restyle.
					</Text>

					<TableRowGroup title="Built-in styles">
						{PRESETS.map(style => (
							<TableSwitchRow
								key={style.id}
								label={style.name}
								subLabel={style.local || hasAi ? style.description : `${style.description}. Needs AI Core.`}
								disabled={!style.local && !hasAi}
								value={enabled.has(style.id)}
								onValueChange={(value: boolean) => togglePreset(style.id, value)}
							/>
						))}
					</TableRowGroup>

					{hasAi ? (
						<>
							<TableRowGroup title="Your styles" hasIcons>
								{custom.length ? (
									custom.map(style => (
										<TableRow
											key={style.id}
											label={style.name}
											subLabel={style.prompt}
											icon={rowIcon('PencilIcon', 'ic_edit_24px')}
											arrow
											onPress={() => {
												setEditing(style.id)
												setName(style.name)
												setPrompt(style.prompt)
											}}
										/>
									))
								) : (
									<TableRow label="None yet" subLabel="Describe one below. Your own styles are always in Restyle." />
								)}
							</TableRowGroup>

							<TableRowGroup title={editing ? 'Edit style' : 'New style'} hasIcons>
								<FieldRow label="Name">
									<TextInput placeholder="e.g. Cowboy" value={name} onChange={setName} />
								</FieldRow>
								<FieldRow
									label="Rewrite the message as…"
									description="Plain words are enough. Name a voice and a few words it uses."
								>
									<TextInput
										placeholder="a Wild West cowboy: howdy, partner, reckon"
										value={prompt}
										multiline
										onChange={setPrompt}
									/>
								</FieldRow>
								<TableRow
									label={editing ? 'Save changes' : 'Add style'}
									icon={rowIcon('CheckmarkLargeIcon', 'ic_check')}
									disabled={!name.trim() || !prompt.trim()}
									onPress={save}
								/>
								{editing ? (
									<>
										<TableRow label="Cancel" icon={rowIcon('XSmallIcon', 'ic_close')} onPress={resetForm} />
										<TableRow
											variant="danger"
											label="Delete style"
											icon={dangerIcon('TrashIcon', 'ic_trash_24px')}
											onPress={remove}
										/>
									</>
								) : null}
							</TableRowGroup>

						</>
					) : null}
				</Stack>
			</ScrollView>
		</Page>
	)
}
