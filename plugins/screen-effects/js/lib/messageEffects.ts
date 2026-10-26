import { argument, OptionType, registerCommand } from "./commands"
import { refreshNative, watchNative } from "../ui/state"

/**
 * Message effects: `/fx effect:slam message:hi` sends "hi" with the effect hidden inside it, and
 * anyone running this plugin who has that channel open sees the effect play. Everyone else just
 * sees "hi".
 *
 * The effect rides in invisible characters at the end of the text: a U+2063 (invisible
 * separator), the effect's number as four bits of U+200B / U+200C (zero-width space / non-joiner),
 * and another U+2063. Zero-width joiners are avoided on purpose, since one next to an emoji would
 * change how the emoji draws. The order below is the wire format: add new effects at the end only.
 */
export const MESSAGE_EFFECTS = [
	{ value: "slam", label: "Slam", subLabel: "The screen jolts and a shockwave blasts out." },
	{ value: "shake", label: "Shake", subLabel: "The whole screen rattles for a moment." },
	{ value: "confetti", label: "Confetti", subLabel: "Confetti rains down the screen." },
	{ value: "love", label: "Love", subLabel: "Hearts float up from the bottom." },
	{ value: "glitch", label: "Glitch", subLabel: "The screen tears and jitters." },
	{ value: "fireworks", label: "Fireworks", subLabel: "Bursts of stars pop across the top." },
	{ value: "swirl", label: "Swirl", subLabel: "The middle of the screen twists and untwists." },
	{ value: "tnt", label: "TNT", subLabel: "A white flash, a blast of blocks and a hard shake." },
] as const

/**
 * What /fx and the preview list offer. TNT stays in MESSAGE_EFFECTS only because its index is part
 * of the wire format; it was removed, so one sent by an older version decodes and plays nothing.
 */
export const OFFERED_MESSAGE_EFFECTS = MESSAGE_EFFECTS.filter(e => e.value !== "tnt")

export type MessageEffect = (typeof MESSAGE_EFFECTS)[number]["value"]

const SEPARATOR = "⁣"
const ZERO = "​"
const ONE = "‌"
const MARKER = /⁣([​‌]{4})⁣/

export function encode(text: string, effect: MessageEffect): string {
	const index = MESSAGE_EFFECTS.findIndex(e => e.value === effect)
	if (index < 0) return text
	let bits = ""
	for (let bit = 3; bit >= 0; bit--) bits += (index >> bit) & 1 ? ONE : ZERO
	return `${text}${SEPARATOR}${bits}${SEPARATOR}`
}

export function decode(content: unknown): MessageEffect | undefined {
	if (typeof content !== "string") return undefined
	const match = MARKER.exec(content)
	if (!match) return undefined
	let index = 0
	for (const ch of match[1]!) index = (index << 1) | (ch === ONE ? 1 : 0)
	return MESSAGE_EFFECTS[index]?.value
}

/** Registers `/fx`. Returns the unregister callback straight away; the command lands when Discord's does. */
export function registerFxCommand(): () => void {
	let unregister = () => {}
	let signature = ""
	let allowed = new Set<string>()
	const unwatch = watchNative(state => {
		const offered = OFFERED_MESSAGE_EFFECTS.filter(e => state.messageCapabilities?.[e.value] !== false)
		const next = offered.map(e => e.value).join(",")
		if (next === signature) return
		signature = next
		allowed = new Set(offered.map(e => e.value))
		unregister()
		unregister = registerCommand({
		name: "fx",
		description: "Send a message with a screen effect (seen by people with VFX)",
		options: [
			{
				name: "effect",
				description: "What plays on their screen",
				type: OptionType.String,
				required: true,
				choices: offered.map(e => ({ name: e.label, value: e.value })),
			},
			{
				name: "message",
				description: "What to say",
				type: OptionType.String,
				required: true,
			},
		],
		execute(args) {
			const effect = argument<string>(args, "effect", "") as MessageEffect
			const message = argument<string>(args, "message", "").trim()
			if (!message || !allowed.has(effect)) return
			return { content: encode(message, effect) }
		},
	})
	})
	refreshNative()
	return () => { unwatch(); unregister() }
}
