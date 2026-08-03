import { encryptMessageText } from "./backup"
import type { DeletedMessage } from "../types"

const GUILDS = [
	{ id: "g-01", name: "Night Shift", icon: "a1" },
	{ id: "g-02", name: "Art Lab", icon: "a2" },
	{ id: "g-03", name: "Raid Corner", icon: "a3" },
	{ id: "g-04", name: "Code Garden", icon: "a4" },
	{ id: "g-05", name: "Study Hall", icon: "a5" },
]

const AUTHORS = [
	"Maya",
	"Jules",
	"Niko",
	"Ari",
	"Lina",
	"Rin",
	"Noel",
	"Skye",
	"Quinn",
	"Zane",
]

const CHANNELS = ["general", "media", "memes", "support", "clips", "off-topic", "music", "dev-chat"]

const LINES = [
	"Deleted this right after sending it.",
	"Oops wrong channel, pretend this never happened.",
	"This one had context but then vanished.",
	"Testing how dense rows look on this page.",
	"A longer message preview to test wrapping behavior in table rows.",
	"Attachment removed but metadata should still render.",
	"Quick typo fix that became a delete.",
]

export function makeFakeDeletedMessages(count = 200): DeletedMessage[] {
	const now = Date.now()
	const out: DeletedMessage[] = []

	for (let i = 0; i < count; i++) {
		const guild = GUILDS[i % GUILDS.length]
		const authorName = AUTHORS[i % AUTHORS.length]
		const channel = CHANNELS[i % CHANNELS.length]
		const plain = `${LINES[i % LINES.length]} (#${i + 1})`
		const withAttachment = i % 4 === 0

		out.push({
			id: `fake-${i + 1}`,
			channelId: `c-${guild.id}-${channel}`,
			guildId: guild.id,
			authorId: `u-${(i % 80) + 1}`,
			authorName,
			channelName: `#${channel}`,
			guildName: guild.name,
			authorAvatar: undefined,
			guildIcon: guild.icon,
			content: encryptMessageText(plain),
			attachments: withAttachment
				? [{ filename: `image-${i + 1}.png`, url: `https://example.invalid/file/${i + 1}` }]
				: undefined,
			sentAt: now - (count - i) * 120000,
			deletedAt: now - (count - i) * 90000,
		})
	}

	out.sort((a, b) => b.deletedAt - a.deletedAt)
	return out
}
