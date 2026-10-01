/*
 * Ported from Vencord's reviewDB plugin (src/plugins/reviewDB/auth.tsx).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../../NOTICE.md.
 *
 * Desktop opens Discord's OAuth2AuthorizeModal with `openModal`. The mobile app has the same
 * component (modules/oauth2/native/OAuth2AuthorizeModal.tsx) and the same props; it is pushed on
 * the root navigator with `pushModal` instead. The exchange then adds `clientMod=vendetta`: ReviewDB
 * checks the value against its own list, and "vendetta" is the one it accepts from mobile mods.
 */

import { API_URL } from './api'
import { confirm, modals, OAuth2AuthorizeModal, TAG, toast } from './discord'
import { refreshUser } from './startup'
import { getToken, updateAuth } from './state'

export const CLIENT_ID = '915703782174752809'
const CLIENT_MOD = 'vendetta'
const MODAL_KEY = 'reviewdb-oauth2-authorize'

async function exchange(location: string, callback?: () => void) {
	try {
		// Plain string building: React Native's URL has no working searchParams.append (it throws
		// "not implemented"), which is what desktop uses here.
		const sep = location.includes('?') ? '&' : '?'
		const url = `${location}${sep}returnType=json&clientMod=${CLIENT_MOD}`
		console.log(`${TAG} authorize: exchanging the Discord code with ReviewDB`)
		const res = await fetch(url, { headers: { Accept: 'application/json' } })
		const body = await res.json().catch(() => ({}) as any)

		if (!res.ok || !body?.token) {
			console.error(`${TAG} authorize: ReviewDB answered ${res.status}: ${body?.message ?? '(no message)'}`)
			toast(body?.message ?? 'An error occurred while authorizing')
			return
		}

		updateAuth({ token: body.token })
		console.log(`${TAG} authorize: signed in, token stored=${!!getToken()}`)
		refreshUser().catch(() => {})
		toast('Successfully logged in!')
		callback?.()
	} catch (error) {
		console.error(`${TAG} failed to authorize:`, error)
		toast('Authorization failed. Try again later.')
	}
}

function httpClient(): any {
	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		return lookupModule<any>(withProps('HTTP', 'getAPIBaseURL'))?.[0]?.HTTP
	} catch {
		return undefined
	}
}

/**
 * The fallback when Discord's authorize screen isn't loaded. Discord only loads that module
 * through its own lazy loader, so on most sessions it isn't there to find. This asks first, in
 * Discord's alert dialog, then makes the same `POST /oauth2/authorize` the screen makes when you
 * press Authorize, through Discord's own HTTP client (which adds your session itself).
 */
function authorizeDirect(callback?: () => void) {
	const HTTP = httpClient()
	console.log(`${TAG} authorize: Discord authorize screen not loaded, using the direct request`)
	if (typeof HTTP?.post !== 'function') {
		console.error(`${TAG} authorize: no OAuth2AuthorizeModal and no HTTP client`)
		toast("Couldn't authorize: Discord's request helper wasn't found.")
		return
	}

	confirm({
		title: 'Authorize ReviewDB?',
		body: "ReviewDB will see your Discord username and avatar (the \"identify\" scope). It can't read your messages or servers. You can remove it any time in Settings → Authorized Apps.",
		confirmText: 'Authorize',
		cancelText: 'Cancel',
		async onConfirm() {
			try {
				console.log(`${TAG} authorize: asking Discord for a code`)
				const res = await HTTP.post({
					url: '/oauth2/authorize',
					query: {
						client_id: CLIENT_ID,
						response_type: 'code',
						redirect_uri: `${API_URL}/auth`,
						scope: 'identify',
					},
					body: { authorize: true, permissions: '0' },
				})
				const location = res?.body?.location
				console.log(`${TAG} authorize: Discord answered ${res?.status}, location=${typeof location === "string"}`)
				if (typeof location !== 'string') {
					console.error(`${TAG} authorize: no location in`, res?.body)
					toast('Discord refused the authorization.')
					return
				}
				await exchange(location, callback)
			} catch (error: any) {
				console.error(`${TAG} authorize request failed:`, error)
				toast(error?.body?.message ?? 'Authorization failed. Try again later.')
			}
		},
	})
}

export function authorize(callback?: () => void) {
	const api = modals()
	const Modal = OAuth2AuthorizeModal()
	if (!api || !Modal) {
		authorizeDirect(callback)
		return
	}

	const close = () => {
		try {
			api.popModal(MODAL_KEY)
		} catch {
			/* already closed */
		}
	}

	api.pushModal({
		key: MODAL_KEY,
		modal: {
			key: MODAL_KEY,
			modal: Modal,
			animation: 'slide-up',
			shouldPersistUnderModals: false,
			closable: true,
			props: {
				clientId: CLIENT_ID,
				redirectUri: `${API_URL}/auth`,
				scopes: ['identify'],
				responseType: 'code',
				permissions: 0n,
				cancelCompletesFlow: false,
				callback: ({ location }: { location: string }) => exchange(location, callback),
				dismissOAuthModal: close,
			},
		},
	})
}
