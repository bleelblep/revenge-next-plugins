/*
 * "Server Reviews" in the server long-press sheet. Desktop adds "View Reviews" to the guild
 * context menus (src/plugins/reviewDB/index.tsx, `guildPopoutPatch`).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * `GuildActionSheet` renders `GuildActionSheetActions.GuildActionSheetSecondaryActions({ guild })`
 * off the module namespace at render time, so a hook on that export adds a group of our own after
 * it. Same `before` stash / `after` pair as patches/profileCard.tsx.
 */

import { TAG } from '../lib/discord'
import { ReviewType } from '../lib/entities'
import { openReviews } from '../ui/routes'

const PATH = 'modules/guild_action_sheet/native/components/GuildActionSheetActions.tsx'
const TARGET = 'GuildActionSheetSecondaryActions'

let actionSheetRow: any
function ActionSheetRowComponent() {
	if (!actionSheetRow) {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		actionSheetRow = lookupModule<any>(withProps('ActionSheetRow'))?.[0]?.ActionSheetRow
	}
	return actionSheetRow
}

function hideActionSheet() {
	try {
		revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
	} catch {
		/* the sheet stays open; harmless */
	}
}

function ServerReviewsGroup({ guild }: { guild: { id: string; name: string } }) {
	const ActionSheetRow = ActionSheetRowComponent()
	if (!ActionSheetRow) return null
	return (
		<ActionSheetRow.Group>
			<ActionSheetRow
				label="Server Reviews"
				icon={<ActionSheetRow.Icon source={revenge.assets.getAssetIdByName('StarIcon')} />}
				onPress={() => {
					hideActionSheet()
					openReviews(guild.id, guild.name, ReviewType.Server)
				}}
			/>
		</ActionSheetRow.Group>
	)
}

export default function patchGuildSheet(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.[TARGET] !== 'function') {
				console.error(`${TAG} ${TARGET} not found on ${PATH}; the server sheet row is off.`)
				return
			}
			patches.push(
				revenge.patcher.before(mod, TARGET, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				revenge.patcher.after(mod, TARGET, (ret: any) => {
					const guild = lastProps?.guild
					lastProps = undefined
					if (typeof guild?.id !== 'string') return ret
					return (
						<>
							{ret}
							<ServerReviewsGroup guild={guild} />
						</>
					)
				}),
			)
			console.log(`${TAG} hooked ${TARGET}`)
		} catch (error) {
			console.error(`${TAG} failed to hook the server sheet:`, error)
		}
	}

	try {
		unsubscribe = (revenge.discord.utils.modules.finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		console.error(`${TAG} server sheet lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
