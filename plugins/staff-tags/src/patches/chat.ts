import getTag from "../lib/getTag"
import type { StaffTagsStorage } from "../index"

const { lookupModule } = revenge.modules.finders
const { withName, withStoreName } = revenge.modules.finders.filters
const { ReactNative } = revenge.react
const { chroma } = revenge.discord.common

const getTagProperties = lookupModule<any>(withName("getTagProperties"))?.[0]
const GuildStore = lookupModule<any>(withStoreName("GuildStore"))?.[0]
const ChannelStore = lookupModule<any>(withStoreName("ChannelStore"))?.[0]

export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	// Patching a module that didn't resolve throws, which takes the whole plugin down with
	// it. Skip this surface instead and let the others carry on.
	if (!getTagProperties) return () => {}

	return revenge.patcher.after(getTagProperties, "default", ([{ message }]: any[], ret: any) => {
		// A message that already carries a tag (bot, system, automod...) has non-empty
		// tagText, so leaving those alone no longer needs the localised name list.
		if (!ret?.tagText && message?.author) {
			const channel = ChannelStore.getChannel(message.channel_id)
			const guild = GuildStore.getGuild(channel?.guild_id)

			const tag = getTag(guild, channel, message.author, !!jsonStorage.cache.useRoleColor)

			if (tag) {
				return {
					...ret,
					tagText: tag.text,
					tagTextColor: tag.textColor
						? ReactNative.processColor(chroma(tag.textColor).hex())
						: undefined,
					tagBackgroundColor: tag.backgroundColor
						? ReactNative.processColor(chroma(tag.backgroundColor).hex())
						: undefined,
					tagVerified: tag.verified,
					tagType: undefined,
				}
			}
		}
		return ret
	})
}
