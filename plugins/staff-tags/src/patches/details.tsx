import getTag, { isBuiltInTag } from "../lib/getTag"
import type { StaffTagsStorage } from "../index"

const { lookupModule, lookupModules } = revenge.modules.finders
const { withProps, withStoreName, withTypeName } = revenge.modules.finders.filters
const { findInReactTree } = revenge.utils.react

const TagModule = lookupModule<any>(withProps("getBotLabel"))?.[0]
const GuildStore = lookupModule<any>(withStoreName("GuildStore"))?.[0]

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

	const rows = lookupModules<any>(withTypeName("UserRow"))
	for (const UserRow of rows ?? []) {
		if (UserRow) patches.push(revenge.patcher.after(UserRow, "type", rowPatch(jsonStorage)))
	}

	return () => patches.forEach(unpatch => unpatch())
}
