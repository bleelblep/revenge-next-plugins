import { renderMarkdown } from './markdown'
import { makeSilent } from './silent'
import { getAi, settings, TAG } from './state'
import { transform } from './transform'
import { captureRandom, sendWithPreviewRandom } from './random'
import { greetingsUnlocked, hasGreetingTarget, replacementFor, ruleScopeMatches, wagonAllowsRule } from './greetings'
import { compileRule } from './textReplace'
import { expandSnippets } from './templateSyntax'
import { validateTemplate } from './templateValidation'
import { aiReady, allStyles, armRestyle, type Restyled, restyle, type Style } from './styles'

/**
 * Preview: a Discord dialog showing the draft as the message it would become, with Send and Close.
 * Nothing is sent or added to the chat until Send.
 *
 * It runs the same steps as the send hook (`patches/outgoing.ts`): link cleaning, link rules and
 * text rules (`transform`), then @silent when Silent messages is on. So the preview is what would
 * actually leave, not just what was typed.
 *
 * ## Drawing the message
 *
 * Your avatar and name, then the text with Discord's markdown (`lib/markdown.tsx`), in a scroll
 * view capped at about half the screen so a long message can be read to the end.
 *
 * 0.5.x borrowed the delete dialog's `LongPressMessageChatItemPreview` instead. Discord only loads
 * that with the message long-press menu, so until a message had been long-pressed the dialog fell
 * back to plain unformatted text ("sometimes not showing"); it also caps its own height, so a long
 * draft was cut off with no way to scroll. Drawing it here behaves the same every time.
 *
 * The idea is nexpid's Message Preview (Vendetta); this is written for Send Tweaks and shares no
 * code with it. Text only: attachments waiting to upload are not shown.
 *
 * ## Restyle
 *
 * A third button opens a list of styles (`lib/styles.ts`). Picking one rewrites the draft and
 * reopens this preview with the result and the style's name as the title; Send then sends that.
 * The draft in the message box is never changed, so closing leaves what you typed.
 */

import { showToast } from './toast'

const ALERT_KEY = 'SendTweaksPreview'
const PICKER_KEY = 'SendTweaksRestyle'
const LIMIT = 2000

function toast(content: string) {
	showToast(content, { key: 'SendTweaksPreviewToast' })
}

/** The text a send would carry right now, as Send Tweaks would change it. */
export function previewText(draft: string, restyled = false): string {
	let text = transform(draft, { polish: !restyled }).text
	if (settings().silentMessages) text = makeSilent(text)
	return text
}

function avatarUrl(me: any): string | undefined {
	try {
		const url = me.getAvatarURL?.(undefined, 64, false)
		if (typeof url === 'string') return url
	} catch {
		/* the default avatar below */
	}
	return me.avatar
		? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`
		: "https://cdn.discordapp.com/embed/avatars/0.png"
}

/** The message as it would appear: who it's from, then the formatted text, scrollable. */
function previewMessage(content: string, warnings: string[] = []): any {
	const React = revenge.react.React
	const { Image, ScrollView, View, Dimensions } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design as any
	const me = (revenge.discord.flux.Stores as any).UserStore?.getCurrentUser?.()

	let body: any
	try {
		body = renderMarkdown(content)
	} catch (error) {
		console.error(`${TAG} preview: markdown failed, showing the text as typed:`, error)
		body = React.createElement(Text, { variant: 'text-md/normal', color: 'text-default', selectable: true }, content)
	}

	const author = me
		? React.createElement(
				View,
				{ style: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 } },
				React.createElement(Image, {
					source: { uri: avatarUrl(me) },
					style: { width: 28, height: 28, borderRadius: 14, marginRight: 8 },
				}),
				React.createElement(
					Text,
					{ variant: 'text-md/semibold', color: 'text-default' },
					me.globalName ?? me.global_name ?? me.username,
				),
			)
		: null

	return React.createElement(
		ScrollView,
		{
			style: { maxHeight: Math.round(Dimensions.get('window').height * 0.5) },
			// Inside the alert, the scroll view has to claim the drag or the dialog eats it.
			nestedScrollEnabled: true,
			keyboardShouldPersistTaps: 'handled',
		},
		author,
		body,
		...warnings.map(warning => React.createElement(Text, { key: warning, variant: 'text-sm/normal', color: 'text-feedback-warning', style: { marginTop: 8 } }, warning)),
	)
}

/**
 * Opens the preview for the send button's live composer text. [send] is its own `onPress`;
 * without it the dialog only has Close. Returns false if there was nothing to preview.
 */
export function showPreview(
	draft: string | undefined,
	send?: () => void,
	styled?: { result: Extract<Restyled, { ok: true }>; style: Style },
): boolean {
	if (draft === undefined) {
		toast("Couldn't read the message box yet — reopen the chat and try again")
		return false
	}
	if (!draft.trim()) {
		toast('Nothing to preview yet')
		return false
	}

	const source = styled ? styled.result.text : draft
	const { result: content, choices } = captureRandom(() => previewText(source, !!styled))
	const warnings: string[] = []
	if (greetingsUnlocked()) {
		const s = settings()
		for (const rule of s.textReplace ? s.rules : []) {
			if (!rule.enabled || !ruleScopeMatches(rule.scope) || !wagonAllowsRule(replacementFor(rule)) || !compileRule(rule).pattern?.test(draft)) continue
			const expanded = expandSnippets(replacementFor(rule), s.snippets ?? [])
			warnings.push(...validateTemplate(expanded, content, s.snippets ?? [], Infinity))
			if (/\{mention\}/.test(expanded) && !hasGreetingTarget()) warnings.push('No recipient found for {mention}. Reply to someone or provide a fallback.')
		}
		// Account limits can vary by Discord entitlement/experiment: use a conservative advisory.
		if (content.length > LIMIT) warnings.push(`Output has ${content.length} characters. Check your account's message-length limit before sending.`)
	} else if (styled && content.length > LIMIT) {
		warnings.push(`The restyled message has ${content.length} characters, over Discord's usual ${LIMIT}. Try Shorter, or a different style.`)
	}
	const { AlertModal, AlertActionButton } = revenge.discord.design.Design as any
	const alerts = revenge.discord.actions.AlertActionCreators
	const React = revenge.react.React
	const close = () => alerts.dismissAlert(ALERT_KEY)

	try {
		alerts.openAlert(
			ALERT_KEY,
			React.createElement(AlertModal, {
				title: styled ? styled.style.name : 'Preview',
				extraContent: previewMessage(content, [...new Set(warnings)]),
				actions: React.createElement(
					React.Fragment,
					null,
					typeof send === 'function'
						? React.createElement(AlertActionButton, {
								text: 'Send',
								variant: 'primary',
								onPress: () => {
									close()
									if (styled) armRestyle(styled.result)
									sendWithPreviewRandom(source, choices, send)
								},
							})
						: null,
					// Restyle is switched off for now (0.8.2) while the send button is bug-fixed. Bring it
					// back with the Styles row in Settings.tsx and the route in routes.tsx.
					// hasStyles()
					// 	? React.createElement(AlertActionButton, {
					// 			text: styled ? 'Another style' : 'Restyle',
					// 			variant: 'secondary',
					// 			onPress: () => {
					// 				close()
					// 				showStylePicker(draft, send, !!styled)
					// 			},
					// 		})
					// 	: null,
					React.createElement(AlertActionButton, { text: 'Close', variant: 'secondary', onPress: close }),
				),
			}),
		)
		return true
	} catch (error) {
		console.error(`${TAG} preview failed:`, error)
		toast("Couldn't show a preview here")
		return false
	}
}

/** Pig Latin is always there; the AI styles need AI Core installed. */
function usableStyles(): Style[] {
	const ai = !!getAi()
	return allStyles(settings()).filter(style => style.local || ai)
}

// /** Always: with nothing switched on, the picker says where to turn styles on. */
// function hasStyles(): boolean {
// 	return true
// }

let busy = false

async function applyStyle(draft: string, send: (() => void) | undefined, style: Style) {
	if (busy) return
	busy = true
	if (!style.local) toast(`Restyling as ${style.name}…`)
	try {
		const result = await restyle(draft, style)
		if (!result.ok) {
			toast(result.error)
			return
		}
		showPreview(draft, send, { result, style })
	} catch (error) {
		console.error(`${TAG} restyle failed:`, error)
		toast("Couldn't restyle that message")
	} finally {
		busy = false
	}
}

/**
 * The list of styles, in Discord's alert dialog like the preview itself. [restyled] adds a way back
 * to the message as typed.
 */
export function showStylePicker(draft: string, send: (() => void) | undefined, restyled = false) {
	const React = revenge.react.React
	const { ScrollView, Dimensions } = revenge.react.ReactNative
	const { AlertModal, AlertActionButton, TableRowGroup, TableRow } = revenge.discord.design.Design as any
	const alerts = revenge.discord.actions.AlertActionCreators
	const close = () => alerts.dismissAlert(PICKER_KEY)
	const styles = usableStyles()
	const ai = aiReady()

	const row = (style: Style) =>
		React.createElement(TableRow, {
			key: style.id,
			label: style.name,
			subLabel: style.local || ai ? style.description : `${style.description}. AI Core can't make calls right now.`,
			disabled: !style.local && !ai,
			onPress: () => {
				close()
				applyStyle(draft, send, style)
			},
		})

	try {
		alerts.openAlert(
			PICKER_KEY,
			React.createElement(AlertModal, {
				title: 'Restyle',
				content: getAi()
					? 'AI styles send this message to the provider set up in AI Core, one call each.'
					: undefined,
				extraContent: React.createElement(
					ScrollView,
					{
						style: { maxHeight: Math.round(Dimensions.get('window').height * 0.5) },
						nestedScrollEnabled: true,
					},
					React.createElement(
						TableRowGroup,
						null,
						restyled
							? React.createElement(TableRow, {
									key: 'original',
									label: 'As typed',
									subLabel: 'Back to your own words',
									onPress: () => {
										close()
										showPreview(draft, send)
									},
								})
							: null,
						...(styles.length
							? styles.map(row)
							: [
									React.createElement(TableRow, {
										key: 'none',
										label: 'No styles switched on',
										subLabel: 'Pick the ones you want in Send Tweaks → Styles. They all start off.',
									}),
								]),
					),
				),
				actions: React.createElement(AlertActionButton, { text: 'Cancel', variant: 'secondary', onPress: close }),
			}),
		)
	} catch (error) {
		console.error(`${TAG} style picker failed:`, error)
		toast("Couldn't show the styles here")
	}
}
