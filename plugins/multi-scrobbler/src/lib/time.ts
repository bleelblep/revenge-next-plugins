export function getCurrentTimestamp(): number {
	return Math.floor(Date.now() / 1000)
}

/** MM:SS, or H:MM:SS for anything over an hour. */
export function formatDuration(seconds: number): string {
	if (!seconds || seconds < 0) return "0:00"

	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const remaining = Math.floor(seconds % 60)

	if (hours > 0) {
		return `${hours}:${minutes.toString().padStart(2, "0")}:${remaining.toString().padStart(2, "0")}`
	}
	return `${minutes}:${remaining.toString().padStart(2, "0")}`
}
