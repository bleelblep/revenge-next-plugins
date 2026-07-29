import getTag, { isBuiltInTag } from "../lib/getTag"
import type { StaffTagsStorage } from "../index"

const { lookupModule, lookupModules } = revenge.modules.finders
const { withProps, withName } = revenge.modules.finders.filters
const { findInReactTree } = revenge.utils.react

const TagModule = lookupModule<any>(withProps("getBotLabel"))?.[0]
// Flux stores are looked up by name directly through the Stores proxy, not a module finder
// filter -- there is no `withStoreName` under modules.finders.filters.
const { GuildStore } = revenge.discord.flux.Stores

const rowPatch =
	(jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) =>
	([{ guildId, user }]: any[], res: any) => {
		const label = res?.props?.label
		const nameContainer = findInReactTree(
			label,
			(c: any) =>
				Array.isArray(c?.props?.children) &&
				c.props.children.some(
					(ch: any) => typeof ch === "string" || typeof ch?.props?.children === "string",
				),
		)

		const existingTag = findInReactTree(nameContainer, (c: any) => c?.type?.Types)
		if (existingTag && isBuiltInTag(existingTag.props.type)) return res
		if (!nameContainer) return res

		const guild = GuildStore.getGuild(guildId)
		const tag = getTag(guild, undefined, user, !!jsonStorage.cache.useRoleColor)

		if (tag) {
			if (existingTag) {
				Object.assign(existingTag.props, {
					type: 0,
					text: tag.text,
					textColor: tag.textColor,
					backgroundColor: tag.backgroundColor,
					verified: tag.verified,
				})
			} else {
				if (!TagModule?.default) return res

				if (!Array.isArray(nameContainer.props.children)) {
					nameContainer.props.children = [nameContainer.props.children]
				}
				nameContainer.props.children.push(
					<TagModule.default
						type={0}
						text={tag.text}
						textColor={tag.textColor}
						backgroundColor={tag.backgroundColor}
						verified={tag.verified}
					/>,
				)
			}
		}
		return res
	}

export default (jsonStorage: RevengeJsonStorageApi<StaffTagsStorage>) => {
	const patches: Array<() => void> = []

	// There's no confirmed equivalent of classic Revenge's findByTypeNameAll (which scanned
	// rendered React element types, not metro modules) -- withName over metro modules is the
	// closest available primitive and may not find every "UserRow" closure. Best-effort;
	// member-list tags via this surface may simply not appear if it finds nothing, while the
	// primary chat tag surface (patches/chat.ts) is unaffected either way.
	try {
		for (const [UserRow] of lookupModules<any>(withName("UserRow"))) {
			if (UserRow) patches.push(revenge.patcher.after(UserRow, "type", rowPatch(jsonStorage)))
		}
	} catch (error) {
		console.error("[StaffTags] UserRow lookup failed:", error)
	}

	return () => patches.forEach(unpatch => unpatch())
}
