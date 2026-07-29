import getTag, { isBuiltInTag } from "../lib/getTag"
import type { StaffTagsStorage } from "../index"

const { lookupModule } = revenge.modules.finders
const { withName, withProps } = revenge.modules.finders.filters
const { findInReactTree } = revenge.utils.react

// returnNamespace: true -- both patch `.default` below, so the wrapper object is needed
// back, not the unwrapped function `withName` hands back by default.
const DisplayName = lookupModule<any>(withName("DisplayName"), { returnNamespace: true })?.[0]
const HeaderName = lookupModule<any>(withName("HeaderName"), { returnNamespace: true })?.[0]

const TagModule = lookupModule<any>(withProps("getBotLabel"))?.[0]

// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
const { GuildStore, ChannelStore } = revenge.discord.flux.Stores

export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const patches: Array<() => void> = []

	if (HeaderName?.default) {
		patches.push(
			revenge.patcher.after(HeaderName, "default", ([{ channelId }]: any[], ret: any) => {
				if (ret?.props) ret.props.channelId = channelId
				return ret
			}),
		)
	}

	if (DisplayName?.default) {
		patches.push(
			revenge.patcher.after(DisplayName, "default", ([{ guildId, channelId, user }]: any[], ret: any) => {
				const tagComponent = findInReactTree(ret, (c: any) => c?.type?.Types)
				if (!tagComponent || !isBuiltInTag(tagComponent.props.type)) {
					const guild = GuildStore.getGuild(guildId)
					const channel = ChannelStore.getChannel(channelId)
					const tag = getTag(guild, channel, user, !!jsonStorage.cache.useRoleColor)

					if (tag) {
						if (tagComponent) {
							tagComponent.props = {
								type: 0,
								...tag,
							}
						} else {
							const row = findInReactTree(ret, (c: any) => c?.props?.style?.flexDirection === "row")
							if (!row || !Array.isArray(row.props.children) || !TagModule?.default) return ret

							row.props.children.push(
								<TagModule.default
									style={{ marginLeft: 0 }}
									type={0}
									text={tag.text}
									textColor={tag.textColor}
									backgroundColor={tag.backgroundColor}
									verified={tag.verified}
								/>,
							)
						}
					}
				}
				return ret
			}),
		)
	}

	return () => patches.forEach(unpatch => unpatch())
}
