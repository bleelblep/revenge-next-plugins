/**
 * Runs `register` once Revenge's own settings section exists, for plugins whose sections must sit
 * below it (Themes' Theming, then Plugin Hub).
 *
 * Revenge places sections in the order they were registered (revenge-bundle-next
 * `src/plugins/start/settings/index.ts`): indexed ones are spliced in at their index, and Revenge's
 * own, which has none, is `unshift`ed to the top. A section registered before Revenge's is spliced
 * while Discord's "Account Settings" is still first, so index 1 lands below it, and Revenge then goes
 * on top of that. Seen on Discord 349.0 (2026-09-28): Revenge, Account Settings, Plugin Hub,
 * Shortcuts, Theming. Revenge's section can appear after `onSettingsModulesLoaded` has fired, so
 * this checks for it every 250 ms, for up to 10 s, then registers anyway.
 *
 * The check is `addSettingsItemToSection('REVENGE', items => items)`: it throws while the section is
 * missing and otherwise changes nothing.
 *
 * Returns a cancel for the wait.
 */
export function afterRevengeSection(register: () => void): () => void {
	let timer: ReturnType<typeof setTimeout> | undefined
	let attempts = 0
	const settings = revenge.discord.modules.settings as any

	const attempt = () => {
		timer = undefined
		let ready = false
		try {
			settings.addSettingsItemToSection('REVENGE', (items: string[]) => items)()
			ready = true
		} catch {
			/* not registered yet */
		}
		if (ready || ++attempts > 40) {
			register()
			return
		}
		timer = setTimeout(attempt, 250)
	}
	attempt()

	return () => {
		if (timer) clearTimeout(timer)
		timer = undefined
	}
}
