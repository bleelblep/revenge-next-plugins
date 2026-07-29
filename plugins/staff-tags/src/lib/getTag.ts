const { lookupModule } = revenge.modules.finders
const { withProps, withStoreName } = revenge.modules.finders.filters
const { chroma } = revenge.discord.common
const { RawColors } = revenge.discord.design

const Permissions = revenge.discord.common.Constants?.Permissions ?? {}

// Discord occasionally splits/renames the permission-computation helper across builds, so
// try the known export names in order rather than assuming one. Never destructure a finder
// result directly.
const PermissionUtils =
	lookupModule<any>(withProps("computePermissionsForMember"))?.[0] ??
	lookupModule<any>(withProps("computePermissions", "canEveryoneRole"))?.[0] ??
	lookupModule<any>(withProps("computePermissions"))?.[0]

const computePermissions =
	PermissionUtils?.computePermissionsForMember ?? PermissionUtils?.computePermissions

const GuildMemberStore = lookupModule<any>(withStoreName("GuildMemberStore"))?.[0]
const TagModule = lookupModule<any>(withProps("getBotLabel"))?.[0]

/**
 * Ask Discord whether a tag type maps to a built-in label, instead of comparing against a
 * localised name list (i18n lookups can throw as lazy getters on some builds).
 */
export function isBuiltInTag(type: unknown): boolean {
	if (typeof type !== "number") return false

	try {
		const label = TagModule?.getBotLabel?.(type)
		return typeof label === "string" && label.length > 0
	} catch {
		return false
	}
}

interface Tag {
	text: string
	textColor?: any
	backgroundColor?: any
	verified?: boolean | ((guild: any, channel: any, user: any) => boolean)
	condition?: (guild: any, channel: any, user: any) => boolean
	permissions?: string[]
}

const tags: Tag[] = [
	{
		text: "WEBHOOK",
		condition: (_guild, _channel, user) => user.isNonUserBot?.() ?? false,
	},
	{
		text: "OWNER",
		condition: (guild, _channel, user) => guild?.ownerId === user.id,
	},
	{
		text: "ADMIN",
		permissions: ["ADMINISTRATOR"],
	},
	{
		text: "STAFF",
		permissions: ["MANAGE_GUILD", "MANAGE_CHANNELS", "MANAGE_ROLES", "MANAGE_WEBHOOKS"],
	},
	{
		text: "MOD",
		permissions: ["MANAGE_MESSAGES", "KICK_MEMBERS", "BAN_MEMBERS"],
	},
	{
		text: "VC Mod",
		permissions: ["MOVE_MEMBERS", "MUTE_MEMBERS", "DEAFEN_MEMBERS"],
	},
	{
		text: "Chat Mod",
		permissions: ["MODERATE_MEMBERS"],
	},
]

// The permission helper's argument order isn't documented anywhere, so try the known call
// shapes once and remember whichever one answers. -1 means "none of them work", in which
// case permission tags are skipped rather than throwing on every render.
const callShapes = [
	(guild: any, channel: any, user: any) =>
		computePermissions({ user, context: guild, overwrites: channel?.permissionOverwrites }),
	(guild: any, channel: any, user: any) =>
		computePermissions({
			user,
			context: guild,
			overwrites: channel?.permissionOverwrites,
			checkElevated: false,
		}),
	(guild: any, channel: any, user: any) => computePermissions(user, guild, channel),
	(guild: any, channel: any, user: any) => computePermissions(guild, channel, user),
]
let workingShape: number | undefined

function computePermissionsInt(guild: any, channel: any, user: any): bigint | undefined {
	if (typeof computePermissions !== "function") return undefined

	const candidates =
		workingShape === undefined
			? ([...callShapes.keys()] as number[])
			: workingShape === -1
				? []
				: [workingShape]

	for (const index of candidates) {
		try {
			const result = callShapes[index](guild, channel, user)
			if (typeof result === "bigint" || typeof result === "number") {
				workingShape = index
				return BigInt(result)
			}
		} catch {
			/* wrong shape, try the next one */
		}
	}

	if (workingShape === undefined) workingShape = -1
	return undefined
}

export default function getTag(
	guild: any,
	channel: any,
	user: any,
	useRoleColor: boolean,
) {
	if (!user) return undefined

	let permissions: string[] | undefined
	if (guild) {
		const permissionsInt = computePermissionsInt(guild, channel, user)

		if (permissionsInt !== undefined) {
			permissions = Object.entries(Permissions)
				.map(([permission, permissionInt]: [string, unknown]) =>
					permissionsInt & BigInt(permissionInt as any) ? permission : "",
				)
				.filter(Boolean)
		}
	}

	for (const tag of tags) {
		if (
			tag.condition?.(guild, channel, user) ||
			(!user.bot && tag.permissions?.some(perm => permissions?.includes(perm)))
		) {
			const roleColor = useRoleColor
				? GuildMemberStore?.getMember?.(guild?.id, user.id)?.colorString
				: undefined
			const backgroundColor = roleColor || tag.backgroundColor || RawColors?.BRAND_500 || "#5865F2"
			const textColor =
				roleColor || !tag.textColor
					? chroma(backgroundColor).get("lab.l") < 70
						? (RawColors?.WHITE_500 ?? "#FFFFFF")
						: (RawColors?.BLACK_500 ?? "#000000")
					: tag.textColor

			return {
				...tag,
				textColor,
				backgroundColor,
				verified:
					typeof tag.verified === "function"
						? tag.verified(guild, channel, user)
						: (tag.verified ?? false),
				condition: undefined,
				permissions: undefined,
			}
		}
	}

	return undefined
}
