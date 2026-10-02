/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/components/ReviewComponent.tsx,
 * ReviewBadge.tsx, utils.tsx). Copyright (c) 2023 Vendicated and contributors.
 * GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * The permission rules and vote arithmetic are desktop's. The layout follows Discord's own chat
 * message: avatar, name line (name, tag, badges, date), the text, and the votes as reaction-style
 * chips under it. Report / Block / Delete live in a long-press action sheet, like a message's.
 */

import { blockUser, deleteReview, deleteReviewVote, reportReview, unblockUser, voteReview } from '../lib/api'
import { confirm, icon, openURL, openUserProfile, toast } from '../lib/discord'
import { type Badge, type Review, ReviewType, UserType } from '../lib/entities'
import { currentUserId, getAuth, getToken, settings } from '../lib/state'
import { dangerIcon, rowIcon } from '../../../../shared/ui/icon'
import { assetId, isBotUser, Native, Tag, UserAvatar } from './native'
import { openBlockedUsers } from './routes'
import { token } from './theme'

const SHEET_KEY = 'ReviewDBReviewActions'

export function canDeleteReview(profileId: string, review: Review) {
	const myId = currentUserId()
	return myId === profileId || review.sender.discordID === myId || getAuth().user?.type === UserType.Admin
}

export function canBlockReviewAuthor(profileId: string, review: Review) {
	const myId = currentUserId()
	return profileId === myId && review.sender.discordID !== myId
}

export function canReportReview(review: Review) {
	return review.sender.discordID !== currentUserId()
}

function formatDate(seconds: number) {
	const date = new Date(seconds * 1000)
	const now = new Date()
	const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
	if (date.toDateString() === now.toDateString()) return `Today at ${time}`
	const yesterday = new Date(now)
	yesterday.setDate(now.getDate() - 1)
	if (date.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`
	return date.toLocaleDateString()
}

function ReviewBadge({ badge }: { badge: Badge }) {
	const { Image, Pressable } = revenge.react.ReactNative
	return (
		<Pressable
			accessibilityLabel={badge.name}
			hitSlop={6}
			onPress={() => (badge.redirectURL ? openURL(badge.redirectURL) : toast(badge.name))}
			onLongPress={() => toast(badge.description || badge.name)}
		>
			<Image source={{ uri: badge.icon }} style={{ width: 16, height: 16 }} resizeMode="contain" />
		</Pressable>
	)
}

/**
 * One reaction-style pill: up arrow, the net score, down arrow. ReviewDB only returns the net
 * score (ups minus downs), so it sits between the arrows rather than on either one. Your vote
 * tints its arrow and outlines the pill, like a reaction you've added.
 */
function Votes({ review }: { review: Review }) {
	const React = revenge.react.React
	const { View } = revenge.react.ReactNative
	const { Text, IconButton } = revenge.discord.design.Design as any
	const vote = useVote(review)
	const up = assetId('ArrowSmallUpIcon')
	const down = assetId('ArrowSmallDownIcon')
	const fallback = <VotesPill review={review} vote={vote} />
	if (!IconButton || up === undefined || down === undefined) return fallback

	const { localVote, score, isVoting, submitVote } = vote
	const scoreColor =
		score > 0
			? token('TEXT_FEEDBACK_POSITIVE', '#4ecb85')
			: score < 0
				? token('TEXT_FEEDBACK_CRITICAL', '#f57976')
				: token('TEXT_MUTED', '#949ba4')
	return (
		<Native name="IconButton" available fallback={fallback}>
			<View style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
				<IconButton
					icon={up}
					size="sm"
					variant={localVote === true ? 'active' : 'secondary'}
					disabled={isVoting}
					accessibilityLabel="Upvote"
					onPress={() => submitVote(true)}
				/>
				<Text
					variant="text-sm/semibold"
					style={{ color: scoreColor, minWidth: 16, textAlign: 'center' }}
					accessibilityLabel={`Score ${score}`}
				>
					{score}
				</Text>
				<IconButton
					icon={down}
					size="sm"
					variant={localVote === false ? 'active' : 'secondary'}
					disabled={isVoting}
					accessibilityLabel="Downvote"
					onPress={() => submitVote(false)}
				/>
			</View>
		</Native>
	)
}

function useVote(review: Review) {
	const React = revenge.react.React
	const [localVote, setLocalVote] = React.useState<boolean | null>(review.userVote ?? null)
	const [score, setScore] = React.useState(review.score ?? 0)
	const [isVoting, setIsVoting] = React.useState(false)

	React.useEffect(() => {
		setLocalVote(review.userVote ?? null)
		setScore(review.score ?? 0)
	}, [review.score, review.userVote])

	async function submitVote(isUpvote: boolean) {
		if (isVoting) return
		if (review.sender.discordID === getAuth().user?.discordID || review.sender.discordID === currentUserId()) {
			toast('You cannot vote on your own review.')
			return
		}
		setIsVoting(true)
		try {
			if (localVote === isUpvote) {
				if (await deleteReviewVote(review.id)) {
					setLocalVote(null)
					setScore((s: number) => s + (isUpvote ? -1 : 1))
				}
				return
			}
			if (await voteReview(review.id, isUpvote)) {
				const delta = localVote == null ? (isUpvote ? 1 : -1) : isUpvote ? 2 : -2
				setLocalVote(isUpvote)
				setScore((s: number) => s + delta)
			}
		} finally {
			setIsVoting(false)
		}
	}

	return { localVote, score, isVoting, submitVote }
}

/** The hand-drawn pill, for when Discord's IconButton or the arrow assets aren't there. */
function VotesPill({ review: _review, vote }: { review: Review; vote: ReturnType<typeof useVote> }) {
	const { View, Pressable } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design as any
	const { localVote, score, isVoting, submitVote } = vote
	const Up = icon('ArrowSmallUpIcon')
	const Down = icon('ArrowSmallDownIcon')
	const brand = token('BACKGROUND_BRAND', '#5865f2')
	const idle = token('INTERACTIVE_TEXT_DEFAULT', '#b5bac1')
	const upColor = localVote === true ? token('TEXT_FEEDBACK_POSITIVE', '#4ecb85') : idle
	const downColor = localVote === false ? token('TEXT_FEEDBACK_CRITICAL', '#f57976') : idle
	const scoreColor =
		score > 0
			? token('TEXT_FEEDBACK_POSITIVE', '#4ecb85')
			: score < 0
				? token('TEXT_FEEDBACK_CRITICAL', '#f57976')
				: token('TEXT_MUTED', '#949ba4')
	const voted = localVote !== null
	const hit = { top: 8, bottom: 8, left: 6, right: 6 }

	return (
		<View
			style={{
				alignSelf: 'flex-start',
				flexDirection: 'row',
				alignItems: 'center',
				gap: 6,
				height: 28,
				paddingHorizontal: 6,
				marginTop: 6,
				borderRadius: 8,
				borderWidth: 1,
				borderColor: voted ? brand : 'transparent',
				backgroundColor: voted ? `${brand}26` : token('BACKGROUND_MOD_SUBTLE', '#2e3035'),
				opacity: isVoting ? 0.6 : 1,
			}}
		>
			<Pressable
				accessibilityLabel="Upvote"
				accessibilityState={{ selected: localVote === true }}
				hitSlop={hit}
				disabled={isVoting}
				onPress={() => submitVote(true)}
			>
				{Up ? <Up size="xs" color={upColor} /> : <Text style={{ color: upColor }}>▲</Text>}
			</Pressable>
			<Text
				variant="text-sm/semibold"
				style={{ color: scoreColor, minWidth: 12, textAlign: 'center' }}
				accessibilityLabel={`Score ${score}`}
			>
				{score}
			</Text>
			<Pressable
				accessibilityLabel="Downvote"
				accessibilityState={{ selected: localVote === false }}
				hitSlop={hit}
				disabled={isVoting}
				onPress={() => submitVote(false)}
			>
				{Down ? <Down size="xs" color={downColor} /> : <Text style={{ color: downColor }}>▼</Text>}
			</Pressable>
		</View>
	)
}

function ReviewActionsSheet({
	review,
	profileId,
	refetch,
}: {
	review: Review
	profileId: string
	refetch(): void
}) {
	const { ActionSheet, BottomSheetTitleHeader, TableRowGroup, TableRow } = revenge.discord.design.Design as any
	const { hideActionSheet } = revenge.discord.actions.ActionSheetActionCreators
	const isAuthorBlocked = getAuth().user?.blockedUsers?.includes(review.sender.discordID) ?? false
	const run = (fn: () => void) => () => {
		hideActionSheet(SHEET_KEY)
		fn()
	}

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title={`Review by ${review.sender.username}`} />
			<TableRowGroup hasIcons>
				<TableRow
					label="View Profile"
					icon={rowIcon('UserCircleIcon', 'UserIcon')}
					onPress={run(() => openUserProfile(review.sender.discordID))}
				/>
				<TableRow
					label="Copy Text"
					icon={rowIcon('CopyIcon')}
					onPress={run(() => {
						try {
							const Clipboard = (revenge.react.ReactNative as any)?.Clipboard
							if (typeof Clipboard?.setString !== 'function') throw new Error('no clipboard')
							Clipboard.setString(review.comment)
							toast('Copied to clipboard')
						} catch {
							toast("Couldn't copy.")
						}
					})}
				/>
				{canBlockReviewAuthor(profileId, review) ? (
					<TableRow
						label={isAuthorBlocked ? 'Unblock Reviewer' : 'Block Reviewer'}
						variant={isAuthorBlocked ? undefined : 'danger'}
						icon={isAuthorBlocked ? rowIcon('DenyIcon') : dangerIcon('DenyIcon')}
						onPress={run(() => {
							if (isAuthorBlocked) {
								unblockUser(review.sender.discordID).then(ok => ok && refetch())
								return
							}
							confirm({
								title: 'Block this reviewer?',
								body: 'They will be unable to leave further reviews on your profile. You can unblock users in the plugin settings.',
								confirmText: 'Block',
								destructive: true,
								async onConfirm() {
									if (!getToken()) return toast('You must be logged in to block users.')
									if (await blockUser(review.sender.discordID)) refetch()
								},
							})
						})}
					/>
				) : null}
				{canReportReview(review) ? (
					<TableRow
						label="Report Review"
						variant="danger"
						icon={dangerIcon('FlagIcon')}
						onPress={run(() =>
							confirm({
								title: 'Report this review?',
								body: 'ReviewDB moderators will look at it.',
								confirmText: 'Report',
								destructive: true,
								async onConfirm() {
									if (!getToken()) return toast('You must be logged in to report reviews.')
									await reportReview(review.id)
								},
							}),
						)}
					/>
				) : null}
				{canDeleteReview(profileId, review) ? (
					<TableRow
						label="Delete Review"
						variant="danger"
						icon={dangerIcon('TrashIcon')}
						onPress={run(() =>
							confirm({
								title: 'Delete review?',
								body: 'Do you really want to delete this review?',
								confirmText: 'Delete',
								destructive: true,
								async onConfirm() {
									if (!getToken()) return toast('You must be logged in to delete reviews.')
									if (await deleteReview(review.id)) refetch()
								},
							}),
						)}
					/>
				) : null}
			</TableRowGroup>
		</ActionSheet>
	)
}

function openActions(review: Review, profileId: string, refetch: () => void) {
	revenge.discord.actions.ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: ReviewActionsSheet }),
		SHEET_KEY,
		{ review, profileId, refetch } as any,
	)
}

export default function ReviewItem({
	review,
	refetch,
	profileId,
}: {
	review: Review
	refetch(): void
	profileId: string
}) {
	const React = revenge.react.React
	const { View, Pressable } = revenge.react.ReactNative
	const { Text } = revenge.discord.design.Design as any
	const [showAll, setShowAll] = React.useState(false)
	const { hideTimestamps } = settings()

	const isSystem = review.type === ReviewType.System
	const isReal = review.id !== 0
	const isAuthorBlocked = getAuth().user?.blockedUsers?.includes(review.sender.discordID) ?? false
	const openProfile = () => {
		if (!isSystem) openUserProfile(review.sender.discordID)
	}

	const long = review.comment.length > 200 && !showAll
	const isBot = !isSystem && isBotUser(review.sender.discordID)
	const DenyIcon = icon('DenyIcon')

	return (
		<Pressable
			onLongPress={isReal ? () => openActions(review, profileId, refetch) : undefined}
			delayLongPress={350}
			android_ripple={{ color: token('BACKGROUND_MOD_SUBTLE', '#2e3035') }}
			style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 8 }}
		>
			<Pressable onPress={openProfile} disabled={isSystem}>
				<UserAvatar userId={review.sender.discordID} photo={review.sender.profilePhoto} />
			</Pressable>

			<View style={{ flex: 1 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 4 }}>
					<Text variant="text-md/semibold" color="text-strong" onPress={isSystem ? undefined : openProfile}>
						{review.sender.username}
					</Text>
					{isSystem ? (
						<Tag
							type="SYSTEM_DM"
							fallback={
								<View
									style={{
										backgroundColor: token('BACKGROUND_BRAND', '#5865f2'),
										borderRadius: 4,
										paddingHorizontal: 4,
										marginLeft: 2,
									}}
								>
									<Text variant="text-xxs/bold" style={{ color: '#ffffff' }}>
										SYSTEM
									</Text>
								</View>
							}
						/>
					) : null}
					{isBot ? <Tag type="BOT" fallback={null} /> : null}
					{isAuthorBlocked ? (
						<Pressable accessibilityLabel="You have blocked this user" hitSlop={6} onPress={openBlockedUsers}>
							{DenyIcon ? <DenyIcon size="xs" color={token('TEXT_FEEDBACK_CRITICAL', '#f57976')} /> : null}
						</Pressable>
					) : null}
					{(review.sender.badges ?? []).map((badge, i) => (
						<ReviewBadge key={i} badge={badge} />
					))}
					{!hideTimestamps && !isSystem && review.timestamp ? (
						<Text variant="text-xs/medium" color="text-muted" style={{ marginLeft: 2 }}>
							{formatDate(review.timestamp)}
						</Text>
					) : null}
				</View>

				<Text variant="text-md/normal" color="text-default">
					{long ? `${review.comment.substring(0, 200)}… ` : review.comment}
					{long ? (
						<Text variant="text-md/medium" style={{ color: token('TEXT_LINK', '#00a8fc') }} onPress={() => setShowAll(true)}>
							Read more
						</Text>
					) : null}
				</Text>

				{isReal ? <Votes review={review} /> : null}
			</View>
		</Pressable>
	)
}
