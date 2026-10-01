/*
 * The "User Reviews" card on a profile's main tab. Port of Vencord reviewDB's
 * `renderProfileComponent` (src/plugins/reviewDB/index.tsx). Copyright (c) 2023 Vendicated and
 * contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * Where it goes: `UserProfileContent` renders the main tab as a fixed list of cards, and the last
 * two are `UserProfileConnections.UserProfileAccountConnectionsCard` and
 * `…ApplicationRoleConnectionsCard`, read off the module namespace at render time. So a hook on
 * the second one adds a card right after Connections without touching the list itself. That card
 * returns null for most people (no linked-role apps); the hook still adds ours.
 *
 * `after` gets only the return value (porting rule 2), so a `before` stashes the props for the
 * `after` that follows it in the same synchronous call. `before` returns the args array.
 */

import { getReviews } from '../lib/api'
import { defaultAvatar, TAG } from '../lib/discord'
import { ReviewType, type UserReviewsData } from '../lib/entities'
import { openReviews } from '../ui/routes'

const PATH = 'modules/user_profile/native/UserProfileConnections.tsx'
const CARD_PATH = 'modules/user_profile/native/UserProfileCard.tsx'
const TARGET = 'UserProfileApplicationRoleConnectionsCard'

/** Short cache so scrolling a profile, or reopening it, doesn't refetch every time. */
const cache = new Map<string, { at: number; data: UserReviewsData }>()
const CACHE_MS = 60_000

let profileCard: any
function ProfileCardComponent(): any {
	if (profileCard === undefined) {
		try {
			const mod = (revenge.discord.utils.modules.finders as any).lookupModuleWithImportedPath(CARD_PATH)?.[0]
			profileCard = typeof mod?.default === 'function' ? mod.default : null
		} catch {
			profileCard = null
		}
	}
	return profileCard
}

function usernameOf(userId: string): string {
	try {
		const user = (revenge.discord.flux.Stores as any).UserStore?.getUser?.(userId)
		return user?.globalName || user?.username || 'User'
	} catch {
		return 'User'
	}
}

function AvatarStack({ data }: { data: UserReviewsData }) {
	const { View, Image } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design as any
	const reviews = data.reviews.filter(r => r.id !== 0).slice(0, 4)
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center' }}>
			{reviews.map((review, i) => {
				const showCount = i === 3 && data.reviewCount > 4
				return (
					<View key={review.id} style={{ marginLeft: i ? -8 : 0 }}>
						<Image
							source={{ uri: review.sender.profilePhoto || defaultAvatar(review.sender.discordID) }}
							style={{ width: 28, height: 28, borderRadius: 14, opacity: showCount ? 0.35 : 1 }}
						/>
						{showCount ? (
							<View
								style={{
									position: 'absolute',
									top: 0,
									left: 0,
									right: 0,
									bottom: 0,
									alignItems: 'center',
									justifyContent: 'center',
								}}
							>
								<Text variant="text-xs/bold" color="text-strong">
									+{data.reviewCount - 3}
								</Text>
							</View>
						) : null}
					</View>
				)
			})}
		</View>
	)
}

function ReviewsCard({ userId }: { userId: string }) {
	const React = revenge.react.React
	const { TableRowGroup, TableRow, Card, Text } = revenge.discord.design.Design as any
	const [data, setData] = React.useState<UserReviewsData | null>(() => cache.get(userId)?.data ?? null)

	React.useEffect(() => {
		const hit = cache.get(userId)
		if (hit && Date.now() - hit.at < CACHE_MS) {
			setData(hit.data)
			return
		}
		let alive = true
		getReviews(userId, { limit: 4 })
			.then(res => {
				cache.set(userId, { at: Date.now(), data: res })
				if (alive) setData(res)
			})
			.catch(error => console.error(`${TAG} profile card fetch failed:`, error))
		return () => {
			alive = false
		}
	}, [userId])

	const optedOut = !!data?.hasOptedOut
	const count = data?.reviewCount ?? 0
	const label = !data ? 'Loading…' : optedOut ? 'User opted out' : count ? `${count} ${count === 1 ? 'review' : 'reviews'}` : 'No reviews yet'

	const row = (
		<TableRowGroup hasIcons={false}>
			<TableRow
				label={label}
				subLabel={!optedOut && data ? 'Tap to read or write reviews' : undefined}
				trailing={data && count ? <AvatarStack data={data} /> : undefined}
				arrow={!optedOut}
				disabled={optedOut}
				onPress={optedOut ? undefined : () => openReviews(userId, usernameOf(userId), ReviewType.User)}
			/>
		</TableRowGroup>
	)

	const UserProfileCard = ProfileCardComponent()
	if (UserProfileCard) {
		return (
			<UserProfileCard title="User Reviews" titleStyle={{ marginBottom: 8 }}>
				{row}
			</UserProfileCard>
		)
	}
	return (
		<Card>
			<Text variant="text-sm/medium" color="text-strong" style={{ marginBottom: 8 }}>
				User Reviews
			</Text>
			{row}
		</Card>
	)
}

export default function patchProfileCard(): () => void {
	const patches: Array<() => void> = []
	let lastProps: any
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.[TARGET] !== 'function') {
				console.error(`${TAG} ${TARGET} not found on ${PATH}; the profile card is off.`)
				return
			}
			patches.push(
				revenge.patcher.before(mod, TARGET, (args: any[]) => {
					lastProps = args?.[0]
					return args
				}),
				revenge.patcher.after(mod, TARGET, (ret: any) => {
					const props = lastProps
					lastProps = undefined
					const userId = props?.userId
					if (typeof userId !== 'string') return ret
					try {
						const card = <ReviewsCard userId={userId} />
						return ret ? (
							<>
								{ret}
								{card}
							</>
						) : (
							card
						)
					} catch (error) {
						console.error(`${TAG} profile card render failed:`, error)
						return ret
					}
				}),
			)
			console.log(`${TAG} hooked ${TARGET}`)
		} catch (error) {
			console.error(`${TAG} failed to hook the profile:`, error)
		}
	}

	try {
		unsubscribe = (revenge.discord.utils.modules.finders as any).getModuleWithImportedPath(PATH, apply)
	} catch (error) {
		console.error(`${TAG} profile lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		for (const unpatch of patches) unpatch()
		patches.length = 0
	}
}
