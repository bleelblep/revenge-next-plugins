/*
 * ReviewDB: a Revenge Next port of Vencord's reviewDB plugin (src/plugins/reviewDB).
 * Copyright (c) 2023 Vendicated and contributors. GPL-3.0-or-later; see ../NOTICE.md.
 *
 * - patches/profileCard.tsx: the "User Reviews" card on profiles
 * - patches/guildSheet.tsx: "Server Reviews" in the server long-press sheet
 * - ui/routes.tsx + ui/ReviewsScreen.tsx: the list (a settings-stack page), voting, report / block / delete, the composer, paging
 * - lib/startup.tsx: new-review toast and ReviewDB notices, a few seconds after launch
 */

import { TAG } from './lib/discord'
import { refreshUser } from './lib/startup'
import { DEFAULTS, type ReviewDBStorage, setStorage } from './lib/state'
import patchGuildSheet from './patches/guildSheet'
import patchProfileCard from './patches/profileCard'
import Settings from './ui/pages/Settings'
import { registerPages } from './ui/routes'

export default plugin<{ jsonStorage: ReviewDBStorage }>({
	jsonStorage: {
		load: true,
		default: DEFAULTS,
	},
	start({ cleanup, jsonStorage, plugin }) {
		// Hooks on modules Discord already rendered with can't be verified mid-session.
		if (plugin.startedLate) {
			plugin.requireReload()
			return
		}

		setStorage(jsonStorage)
		cleanup(() => setStorage(undefined))

		for (const [name, install] of [
			['profile card', patchProfileCard],
			['server sheet', patchGuildSheet],
			['review pages', registerPages],
		] as const) {
			try {
				cleanup(install())
			} catch (error) {
				console.error(`${TAG} failed to install the ${name}:`, error)
			}
		}

		// Desktop waits 4 seconds after start too: the current user has to be known, and the
		// notice dialog shouldn't land on the splash screen.
		const timer = setTimeout(() => {
			refreshUser({ notify: true }).catch(error => console.error(`${TAG} startup refresh failed:`, error))
		}, 4000)
		cleanup(() => clearTimeout(timer))
	},
	stop(api) {
		api.plugin.requireReload()
	},
	SettingsComponent: Settings,
})
