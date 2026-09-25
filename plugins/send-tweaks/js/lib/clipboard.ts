/** Clipboard from Revenge's bundled module, falling back to React Native's. False if neither is there. */
export function copyText(text: string): boolean {
	try {
		const bundled = (revenge as any).externals?.ReactNativeClipboard?.Clipboard
		const clipboard = bundled ?? (revenge.react.ReactNative as any)?.Clipboard
		if (typeof clipboard?.setString !== 'function') return false
		clipboard.setString(text)
		return true
	} catch {
		return false
	}
}
