// Minimal pub-sub feeding ProgressContent.tsx, which is passed as JSX into the confirmation
// alert's `content` prop (see confirmAndPurge.ts): a small reactive component living inside
// it updates live without needing any custom-mount machinery.

export interface ProgressInfo {
	label: string
	found?: number
	total?: number
	done?: number
	failed?: number
}

let current: ProgressInfo = { label: "" }
const listeners = new Set<(p: ProgressInfo) => void>()

export function setProgress(info: ProgressInfo) {
	current = info
	listeners.forEach(fn => fn(current))
}

export function getProgress(): ProgressInfo {
	return current
}

export function subscribeProgress(fn: (p: ProgressInfo) => void): () => void {
	listeners.add(fn)
	return () => listeners.delete(fn)
}
