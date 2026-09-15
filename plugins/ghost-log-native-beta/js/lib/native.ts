/**
 * JS -> native bridge. The native template imports this from '@revenge-mod/modules/native', which
 * the main revenge-next-plugins build doesn't have. The identical function is exposed on the global
 * revenge API (proven by native plugins like chatbubbles), so we call it there instead — this makes
 * the plugin buildable by the main repo's JS-only bundler unchanged.
 */
export function callNativeMethod(name: string, args: any[]): Promise<any> {
	return (revenge.modules.native as any).callNativeMethod(name, args)
}
