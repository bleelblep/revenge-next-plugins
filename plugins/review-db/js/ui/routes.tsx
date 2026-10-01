/**
 * The reviews and blocked-users screens are routes in Discord's settings stack, so they get the
 * stock header (title, back arrow, status-bar inset) and stock transitions. The routes have no
 * parent, so they don't show up in the settings list; they're opened by navigating the root
 * navigator to `settings` with the route as the nested screen (confirmed on 348, see
 * send-tweaks' SendSheet.tsx).
 *
 * Which user or server to show is kept here, not in route params, so it doesn't depend on
 * params surviving the nested navigate.
 */

import { TAG, toast } from '../lib/discord'
import type { ReviewType } from '../lib/entities'
import BlockedUsers from './BlockedUsers'
import About from './pages/About'
import Options from './pages/Options'
import ReviewsScreen from './ReviewsScreen'

const PREFIX = 'bleelblep.review-db'
export const REVIEWS_ROUTE = `${PREFIX}.reviews`
export const BLOCKED_ROUTE = `${PREFIX}.blocked`
export const OPTIONS_ROUTE = `${PREFIX}.options`
export const ABOUT_ROUTE = `${PREFIX}.about`

export interface ReviewsTarget {
	discordId: string
	name: string
	type: ReviewType
}

let target: ReviewsTarget | null = null
const listeners = new Set<() => void>()

export function getTarget() {
	return target
}

export function useTarget(): ReviewsTarget | null {
	const React = revenge.react.React
	const [, rerender] = React.useReducer((n: number) => n + 1, 0)
	React.useEffect(() => {
		listeners.add(rerender)
		return () => {
			listeners.delete(rerender)
		}
	}, [])
	return target
}

function rootNavigation(): any {
	try {
		const { lookupModule } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const host = lookupModule<any>(withProps('getRootNavigationRef'))?.[0]
		return (host?.getRootNavigationRef ?? host?.default?.getRootNavigationRef)?.()
	} catch {
		return undefined
	}
}

function navigateTo(route: string) {
	const ref = rootNavigation()
	if (typeof ref?.navigate !== 'function') {
		toast("Couldn't open the page.")
		console.error(`${TAG} no root navigation ref for ${route}`)
		return
	}
	try {
		revenge.discord.actions.ActionSheetActionCreators.hideActionSheet()
	} catch {
		/* no sheet open */
	}
	ref.navigate('settings', { screen: route })
}

export function openReviews(discordId: string, name: string, type: ReviewType) {
	target = { discordId, name, type }
	for (const listener of listeners) listener()
	navigateTo(REVIEWS_ROUTE)
}

export function openBlockedUsers() {
	navigateTo(BLOCKED_ROUTE)
}

function refreshSettingsUI() {
	const settings = revenge.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerPages(): () => void {
	const { registerSettingsItem, onSettingsModulesLoaded } = revenge.discord.modules.settings
	let unregister: Array<() => void> = []
	const unsubscribe = onSettingsModulesLoaded(() => {
		unregister = [
			registerSettingsItem(REVIEWS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => {
					const t = useTarget()
					return t ? `${t.name}'s Reviews` : 'Reviews'
				},
				screen: { route: REVIEWS_ROUTE, getComponent: () => ReviewsScreen },
			}),
			registerSettingsItem(BLOCKED_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Blocked users',
				screen: { route: BLOCKED_ROUTE, getComponent: () => BlockedUsers },
			}),
			registerSettingsItem(OPTIONS_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'Options',
				screen: { route: OPTIONS_ROUTE, getComponent: () => Options },
			}),
			registerSettingsItem(ABOUT_ROUTE, {
				parent: null,
				type: 'route',
				useTitle: () => 'About',
				screen: { route: ABOUT_ROUTE, getComponent: () => About },
			}),
		]
		refreshSettingsUI()
	})

	return () => {
		unsubscribe()
		for (const remove of unregister) remove()
		unregister = []
		refreshSettingsUI()
	}
}
