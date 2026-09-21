import type { SecondThoughtsStorage } from './types'

/**
 * Also the fallback for every read: `load: true` starts the storage read without awaiting it,
 * so `jsonStorage.cache` is genuinely undefined for a short window after start (porting rule 7).
 */
export const DEFAULTS: SecondThoughtsStorage = {
	enabled: true,

	checkCredentials: true,
	// Off by default. People post their own email and number on purpose constantly; a guard that
	// fires on that gets uninstalled in a day.
	checkPersonalDetails: false,
	personalDetailsInDms: false,

	// On by default, but inert until AI Core is installed and configured. A switch that does
	// nothing yet is better than one that appears only after an unrelated install.
	checkHostile: true,
	checkDrunk: true,
	checkOversharing: false,
	sensitivity: 3,
	minLength: 8,

	snoozedUntil: 0,

	debugLogging: false,
}
