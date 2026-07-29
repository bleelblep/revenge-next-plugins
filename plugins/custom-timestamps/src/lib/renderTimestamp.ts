export type Mode = "calendar" | "relative" | "custom" | "iso"

export interface TimestampStorage {
	selected: Mode
	customFormat: string
	separateMessages?: boolean
}

/**
 * Format a message timestamp.
 *
 * `message.timestamp` used to be a moment instance on classic Revenge, so the original code
 * called `.calendar()` on it directly. On current Discord it can be a plain string, which
 * threw "undefined is not a function" from inside RowManager.generate and took the whole
 * chat view down. Coerce through moment() -- it accepts strings, numbers and Date, and
 * clones an existing moment, so every case is covered.
 */
export default function renderTimestamp(
	timestamp: any,
	mode: Mode,
	customFormat?: string,
): string {
	const moment = revenge.discord.common.moment

	let value: any
	try {
		value = moment?.isMoment?.(timestamp) ? timestamp : moment(timestamp)
	} catch {
		return ""
	}

	// An unparseable timestamp must not throw during render.
	if (!value || typeof value.calendar !== "function" || value.isValid?.() === false) {
		return typeof timestamp === "string" ? timestamp : ""
	}

	try {
		switch (mode) {
			case "relative":
				return value.fromNow()
			case "iso":
				return value.toISOString()
			case "custom":
				return value.format(customFormat)
			case "calendar":
			default:
				return value.calendar()
		}
	} catch {
		return typeof timestamp === "string" ? timestamp : ""
	}
}
