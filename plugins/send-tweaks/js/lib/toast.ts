/**
 * Toast helper following kmmiio99o's ToastsAPI specification.
 * https://git.gay/kmmiio99o/revenge-next-plugins/src/branch/main/docs/api.md
 *
 * Soft dependency: uses kmio's ToastsAPI if available, otherwise falls back to
 * Discord's native ToastActionCreators.open.
 */

let scopedToasts: any

export function setToastApi(api: any) {
	scopedToasts = api
}

function getToasts(): any {
	if (scopedToasts && typeof scopedToasts.show === 'function') {
		return scopedToasts
	}
	try {
		const rev = (globalThis as any).revenge
		if (typeof rev?.toasts?.show === 'function') return rev.toasts
		if (typeof (globalThis as any).toasts?.show === 'function') return (globalThis as any).toasts
		const plugToasts = rev?.plugins?.plugins?.['dev.kmmiio99o.toasts']?.api?.toasts
		if (typeof plugToasts?.show === 'function') return plugToasts
	} catch {}
	return undefined
}

export interface ToastOptions {
	key?: string
	variant?: 'default' | 'success' | 'critical' | 'warning' | 'info'
	duration?: number
}

export function showToast(content: string, options?: ToastOptions) {
	const toasts = getToasts()
	if (typeof toasts?.show === 'function') {
		toasts.show({
			content,
			key: options?.key,
			variant: options?.variant ?? 'default',
			...(options?.duration !== undefined ? { duration: options.duration } : {}),
		})
		return
	}

	try {
		const openToast = revenge.discord?.actions?.ToastActionCreators?.open
		if (typeof openToast === 'function') {
			openToast({
				key: options?.key ?? 'SendTweaksToast',
				content,
			})
		}
	} catch {
		/* a toast is not worth a crash */
	}
}
