/**
 * The one moment the user ever sees this plugin.
 *
 * Wording matters more than usual here. The modal appears when someone is angry, drunk or in a
 * hurry, and it is standing between them and something they have already decided to do. It states
 * what it noticed in one line, offers the edit as the default, and never lectures.
 */

import type { Verdict } from '../../types'

const ALERT_KEY = 'SecondThoughtsHold'

export interface HoldAlertOptions {
	verdict: Verdict
	/** Send it unchanged. */
	onSend(): void
	/** Put the text back in the box and do not send. */
	onEdit(): void
	/** Send it, and stay quiet for an hour. Absent for credential holds. */
	onSnooze?(): void
}

function titleFor(verdict: Verdict): string {
	switch (verdict.category) {
		case 'credentials':
			return 'Hold on'
		case 'personal':
			return 'Personal detail'
		case 'drunk':
			return 'It is late'
		default:
			return 'Sure about this one?'
	}
}

export function openHoldAlert({
	verdict,
	onSend,
	onEdit,
	onSnooze,
}: HoldAlertOptions) {
	// Read per call, never at module scope -- porting rule 1.
	const { AlertModal, AlertActionButton } = revenge.discord.design.Design
	const Alerts = revenge.discord.actions.AlertActionCreators

	// `onDismiss` fires for a button press as well as a tap-away, so the two have to be told
	// apart or choosing "Send anyway" would also restore the draft.
	let decided = false

	const run = (action: () => void) => () => {
		decided = true
		try {
			Alerts.dismissAlert(ALERT_KEY)
		} catch {
			/* the alert closing itself is not worth a crash */
		}
		action()
	}

	Alerts.openAlert(
		ALERT_KEY,
		<AlertModal
			title={titleFor(verdict)}
			content={verdict.reason}
			actions={
				<>
					<AlertActionButton
						text="Let me edit"
						variant="primary"
						onPress={run(onEdit)}
					/>
					<AlertActionButton
						text="Send anyway"
						variant="secondary"
						onPress={run(onSend)}
					/>
					{onSnooze ? (
						<AlertActionButton
							text="Send, and hush for an hour"
							variant="tertiary"
							onPress={run(onSnooze)}
						/>
					) : null}
				</>
			}
		/>,
		// Tapping away is the same as choosing to edit: nothing is sent, and the text comes back.
		// The safe outcome has to be the one you get by doing nothing.
		() => {
			if (!decided) onEdit()
		},
	)
}
