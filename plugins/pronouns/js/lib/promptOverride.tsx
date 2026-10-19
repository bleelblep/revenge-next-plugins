/**
 * The "set pronouns for this person" dialog: used from the message long-press sheet
 * (patches/messageSheet.tsx) and from the People settings page, so editing an override looks the
 * same from both entry points.
 *
 * Call from an event handler: `revenge.*` is read here, so module scope is out (porting rule 1).
 */

import { resolve } from './resolve'
import { settings, update } from './state'
import { AlertActionCreators } from '@revenge-mod/discord/actions'
import { Design } from '@revenge-mod/discord/design'
import { showToast } from '../../../../shared/toast'
import { reportError } from '../../../../shared/report'

const TAG = '[Pronouns]'

export function promptOverride(userId: string, name: string) {
	const { AlertModal, AlertActionButton, TextInput } = Design as any
	const alerts = AlertActionCreators as any
	const key = 'PronounsOverride'
	const existing = settings().overrides?.[userId]
	const current = typeof existing === 'string' ? existing : (resolve(userId)?.text ?? '')
	let value = current
	const save = () => {
		alerts.dismissAlert(key)
		try {
			const text = value.trim()
			// update() redraws the recent rows (patches/chat.ts listens).
			update({ overrides: { ...settings().overrides, [userId]: text || null } })
			showToast(text ? `Pronouns for ${name} set.` : `Pronouns for ${name} cleared.`, 'PronounsOverrideToast')
		} catch (error) {
			reportError(`${TAG} saving the override failed:`, error)
		}
	}
	alerts.openAlert(
		key,
		<AlertModal
			title={`Pronouns for ${name}`}
			content="What the badge next to their name shows. Leave empty to clear yours."
			extraContent={
				<TextInput
					defaultValue={current}
					placeholder="e.g. they/them"
					autoFocus
					autoCapitalize="none"
					autoCorrect={false}
					onChange={(text: string) => (value = text)}
					onSubmitEditing={save}
				/>
			}
			actions={
				<>
					<AlertActionButton text="Save" variant="primary" onPress={save} />
					{typeof existing === 'string' && (
						<AlertActionButton
							text="Clear"
							variant="destructive"
							onPress={() => {
								value = ''
								save()
							}}
						/>
					)}
					<AlertActionButton text="Cancel" variant="secondary" onPress={() => alerts.dismissAlert(key)} />
				</>
			}
		/>,
	)
}
