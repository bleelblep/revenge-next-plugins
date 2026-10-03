/**
 * Discord's own avatar viewer, unlocked. Tapping a profile avatar already calls
 * `openUserProfileAvatarMediaViewer`, which opens the media viewer with
 * `analyticsSource: "user_profile_avatar"`, saving and sharing off, the overlay buttons hidden and
 * a reduced size. This `before` rewrites exactly those options on the way in and leaves every other
 * viewer (attachments, embeds) untouched. It returns the args array (porting rule 2).
 */

import { FULL_SIZE, fullSize, MEDIA_PATH, TAG } from '../lib/media'

const AVATAR_SOURCE = 'user_profile_avatar'

export default function patchViewerOptions(): () => void {
	let unpatch: (() => void) | undefined
	let unsubscribe: (() => void) | undefined

	const apply = (mod: any) => {
		try {
			if (typeof mod?.openMediaModal !== 'function') {
				console.error(`${TAG} openMediaModal not found on ${MEDIA_PATH}`)
				return
			}
			unpatch = revenge.patcher.before(mod, 'openMediaModal', (args: any[]) => {
				try {
					const options = args?.[0]
					if (options?.analyticsSource === AVATAR_SOURCE) {
						options.shareable = true
						options.disableDownload = false
						options.disableMediaOverlayButton = false
						options.disableMediaOverlayFooter = false
						options.initialSources = (options.initialSources ?? []).map((source: any) =>
							typeof source?.uri === 'string'
								? {
										...source,
										uri: fullSize(source.uri),
										sourceURI: fullSize(source.uri),
										width: FULL_SIZE,
										height: FULL_SIZE,
									}
								: source,
						)
					}
				} catch (error) {
					console.error(`${TAG} viewer options failed:`, error)
				}
				return args
			})
			console.log(`${TAG} hooked openMediaModal`)
		} catch (error) {
			console.error(`${TAG} failed to hook openMediaModal:`, error)
		}
	}

	try {
		unsubscribe = (revenge.discord.utils.modules.finders as any).getModuleWithImportedPath(MEDIA_PATH, apply)
	} catch (error) {
		console.error(`${TAG} openMediaModal lookup failed:`, error)
	}

	return () => {
		unsubscribe?.()
		unpatch?.()
	}
}
