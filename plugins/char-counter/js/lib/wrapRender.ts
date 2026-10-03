/**
 * Replaces `render` on a `memo(forwardRef(render))` component found by its module path, with a
 * plain function (not a patcher `instead`: two `instead` hooks on one method recurse, upstream
 * bug). Installed when the module loads, or at once if it has. The undo only puts Discord's back
 * if nobody has wrapped ours since.
 */
export function wrapRender(
	path: string,
	status: { hooked: boolean; moduleId: number; lastError: string },
	make: (original: (props: any, ref: any) => any) => (props: any, ref: any) => any,
): () => void {
	let host: any
	let original: ((props: any, ref: any) => any) | undefined
	let wrapper: ((props: any, ref: any) => any) | undefined

	const install = (exports: any, id: number) => {
		// Step through memo's `type` to the forwardRef object that holds `render`.
		let target = exports?.default ?? exports
		for (let i = 0; i < 3 && target && typeof target.render !== 'function'; i++) target = target.type
		if (typeof target?.render !== 'function') {
			status.lastError = `module ${id} has no render`
			return
		}
		host = target
		original = target.render
		wrapper = make(original as (props: any, ref: any) => any)
		host.render = wrapper
		status.hooked = true
		status.moduleId = id
	}

	let unsubscribe: (() => void) | undefined
	try {
		unsubscribe = revenge.discord.utils.modules.finders.getModuleWithImportedPath(path, (exports: any, id: any) => {
			try {
				install(exports, id)
			} catch (error) {
				status.lastError = `install: ${(error as Error)?.message ?? error}`
			}
		})
	} catch (error) {
		status.lastError = `lookup: ${(error as Error)?.message ?? error}`
	}

	return () => {
		unsubscribe?.()
		if (host && wrapper && host.render === wrapper) host.render = original
		status.hooked = false
	}
}
