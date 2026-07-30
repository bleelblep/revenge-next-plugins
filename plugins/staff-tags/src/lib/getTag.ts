// Revenge Next's preInit phase runs before Discord's own module registry is populated --
// resolving modules/stores at module top level (like classic Revenge/Vendetta code did) can
// silently and *permanently* cache a "not found" result if it runs too early. Confirmed
// on-device (a `revenge.discord.common` top-level access threw at preInit). Every lookup
// here is deferred behind `lazy()` so the actual resolution only happens the first time it's
// needed, well after start() -- never at module evaluation time.
function lazy<T>(resolve: () => T): () => T {
	let value: T
	let done = false
	return () => {
		if (!done) {
			value = resolve()
			done = true
		}
		return value
	}
}

const tagModule = lazy(
	() => revenge.modules.finders.lookupModule<any>(revenge.modules.finders.filters.withProps("getBotLabel"))?.[0],
)

const guildMemberStore = lazy(() => revenge.discord.flux.Stores.GuildMemberStore)

/**
 * `revenge.discord.common.chroma` doesn't exist -- confirmed from revenge-bundle-next's own
 * source (lib/discord/src/common/index.ts only exports Logger, Tokens, flux, utils,
 * Constants), and was a bad guess by analogy with classic Revenge's chroma-js binding.
 * Colors here are always plain hex strings (from RawColors or a hardcoded fallback), so this
 * is just perceived-brightness math on the hex value directly, no color library needed.
 */
function isDarkColor(hex: string): boolean {
	const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})/i.exec(hex)
	if (!match) return true

	const r = Number.parseInt(match[1], 16)
	const g = Number.parseInt(match[2], 16)
	const b = Number.parseInt(match[3], 16)
	// Perceived brightness (ITU-R BT.601), 0-255. Below ~140 reads as a dark background.
	return (r * 299 + g * 587 + b * 114) / 1000 < 140
}

// Discord occasionally splits/renames the permission-computation helper across builds, so
// try the known export names in order rather than assuming one. Never destructure a finder
// result directly.
const computePermissionsFn = lazy(() => {
	const { lookupModule } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	const PermissionUtils =
		lookupModule<any>(withProps("computePermissionsForMember"))?.[0] ??
		lookupModule<any>(withProps("computePermissions", "canEveryoneRole"))?.[0] ??
		lookupModule<any>(withProps("computePermissions"))?.[0]

	return PermissionUtils?.computePermissionsForMember ?? PermissionUtils?.computePermissions
})

/**
 * Ask Discord whether a tag type maps to a built-in label, instead of comparing against a
 * localised name list (i18n lookups can throw as lazy getters on some builds).
 */
export function isBuiltInTag(type: unknown): boolean {
	if (typeof type !== "number") return false

	try {
		const label = tagModule()?.getBotLabel?.(type)
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
		computePermissionsFn()({ user, context: guild, overwrites: channel?.permissionOverwrites }),
	(guild: any, channel: any, user: any) =>
		computePermissionsFn()({
			user,
			context: guild,
			overwrites: channel?.permissionOverwrites,
			checkElevated: false,
		}),
	(guild: any, channel: any, user: any) => computePermissionsFn()(user, guild, channel),
	(guild: any, channel: any, user: any) => computePermissionsFn()(guild, channel, user),
]
let workingShape: number | undefined

function computePermissionsInt(guild: any, channel: any, user: any): bigint | undefined {
	if (typeof computePermissionsFn() !== "function") return undefined

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
			const permissionConstants = revenge.discord.common.Constants?.Permissions ?? {}
			permissions = Object.entries(permissionConstants)
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
				? guildMemberStore()?.getMember?.(guild?.id, user.id)?.colorString
				: undefined
			const backgroundColor =
				roleColor || tag.backgroundColor || revenge.discord.design.RawColors?.BRAND_500 || "#5865F2"
			const textColor =
				roleColor || !tag.textColor
					? isDarkColor(backgroundColor)
						? (revenge.discord.design.RawColors?.WHITE_500 ?? "#FFFFFF")
						: (revenge.discord.design.RawColors?.BLACK_500 ?? "#000000")
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
