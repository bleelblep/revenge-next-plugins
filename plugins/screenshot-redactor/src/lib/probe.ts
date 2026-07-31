/**
 * A one-shot sweep of Metro's initialized modules, printed to the console.
 *
 * Four releases were spent guessing module names one per round, because the only channel back
 * from the device was a sentence in the settings page. `console.log` reaches `adb logcat` under
 * the `ReactNativeJS` tag, which is enough bandwidth to just *look*.
 *
 * This exists to answer one question: what does the DM channel header use to turn a channel
 * into a person's name? `useName` is hooked and the header plainly doesn't go through it.
 *
 * Debug-only, off by default, and it never logs a value — only module ids and export key names.
 * Nothing here can print a username.
 */

/**
 * Metro ids are dense small integers. There is no "list all modules" call, so the sweep walks
 * the range and asks whether each id is initialized; uninitialized ids cost one call and are
 * skipped. Capped rather than unbounded because this runs on the JS thread.
 */
const MAX_ID = 30000

/** Export keys worth reporting: the vocabulary a name/title resolver is likely to use. */
const INTERESTING = /^(get|use|render|format)?(channel|recipient|dm|group|user|display|nick|global)?.*(name|title|label|tag)$/i

/** Keys that are certain noise at this scale. */
const BORING = /^(displayName|name|fileName|typeName|constructor)$/

export function probeNameModules(): string {
	const { getInitializedModuleExports, isModuleInitialized } = revenge.modules.metro as any

	const hits: string[] = []
	let scanned = 0
	let initialized = 0

	for (let id = 0; id < MAX_ID; id++) {
		scanned++

		let exports: any
		try {
			if (!isModuleInitialized(id)) continue
			initialized++
			exports = getInitializedModuleExports(id)
		} catch {
			continue
		}

		if (!exports || typeof exports !== "object") continue

		try {
			const keys: string[] = []
			for (const key of Object.keys(exports)) {
				if (BORING.test(key)) continue
				if (!INTERESTING.test(key)) continue
				// Only functions: a resolver is callable, a string constant is not what we want.
				if (typeof exports[key] !== "function") continue
				keys.push(key)
			}
			if (keys.length) hits.push(`${id}: ${keys.join(", ")}`)
		} catch {
			// Some namespaces throw on enumeration. Not worth failing the sweep over.
			continue
		}
	}

	const summary = `[ScreenshotRedactor] probe: ${initialized} initialized of ${scanned} scanned, ${hits.length} candidate modules`
	console.log(summary)
	// Chunked: a single enormous line gets truncated in logcat.
	for (let i = 0; i < hits.length; i += 20) {
		console.log(`[ScreenshotRedactor] probe ${i}:\n` + hits.slice(i, i + 20).join("\n"))
	}

	return `${hits.length} candidates across ${initialized} modules — see adb logcat`
}
