/**
 * Which plugins are actually using this one.
 *
 * AI Core is infrastructure, so its settings screen is the wrong place to end up: a user who
 * opens it has almost always come looking for the plugin that sent them there. This registry
 * lets the root page hand them straight back.
 *
 * Every dependent is recorded automatically — `decorate()` is handed the dependent's `Plugin`
 * instance, so its id, name and icon come for free and a plugin needs to do nothing to appear.
 * Making the row *tappable* needs one extra line from the dependent, because only it knows the
 * name of its own navigator route:
 *
 * ```ts
 * start({ ai }) {
 *     ai?.setSettingsRoute(CHECKS_ROUTE)
 * }
 * ```
 *
 * Held in memory rather than storage on purpose. It describes what is running right now, and a
 * stale list of plugins the user has since uninstalled would be worse than no list.
 */

export interface Dependent {
	id: string
	name: string
	/** Manifest icon name, passed to `rowIcon`. */
	icon?: string
	/** Navigator route to jump to, when the dependent has volunteered one. */
	route?: string
	/** Calls made today, filled in by the settings page from usage accounting. */
	calls?: number
}

const dependents = new Map<string, Dependent>()

export function rememberDependent(id: string, name: string, icon?: string) {
	const existing = dependents.get(id)
	dependents.set(id, { ...existing, id, name, icon })
}

export function setDependentRoute(id: string, route: string) {
	const existing = dependents.get(id)
	if (existing) existing.route = route
}

export function forgetDependent(id: string) {
	dependents.delete(id)
}

/** Alphabetical, so the list does not reshuffle itself between renders. */
export function listDependents(): Dependent[] {
	return [...dependents.values()].sort((a, b) => a.name.localeCompare(b.name))
}
