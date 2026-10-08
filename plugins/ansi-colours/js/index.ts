/**
 * ANSI Colours -- JS half.
 *
 * Discord mobile strips the escape codes out of ```ansi blocks while parsing markdown, so the
 * native renderer (AnsiColoursPlugin.kt, which does the colouring) never sees them. 349.5 strips
 * them in three places, all with `content.replaceAll(<regex from ANSI_CONTROL_SEQUENCE_RE>, '')`:
 *
 * - modules/markup/MarkupReactRules.native.tsx, the codeBlock rule (message rows, embeds)
 * - modules/markup_v2/native/transformNativeMarkupNode.tsx (the newer native converter)
 * - modules/markup/native/MarkupMessagePreviewReactRules.tsx (React Native previews)
 *
 * The first two feed the native renderer, the third is drawn by React Native, which can't colour
 * them and would show `[31m`. So the strip is skipped only while one of the native content
 * builders runs (see `nativeBuilders`), by letting that one `replaceAll` call through unchanged.
 *
 * The RowManager hook is the fallback for records Discord parsed before this plugin started:
 * `parseMessageMarkup` memoizes its result per record, so those stay stripped until reparsed.
 */

const TAG = '[ANSI Colours]'
const ESCAPE = /\u001b\[[0-9;]*m/g
// Discord's codeBlock rule, limited to the ansi language.
const ANSI_BLOCK = /```ansi\n\n*([^\n][\s\S]*?)\n*```/gi
// The source of Discord's ANSI_CONTROL_SEQUENCE_RE (`\x1B\[(\d+(?:[:;]\d+)*)m` on 349.5).
const DISCORD_ANSI_SOURCE = /^\\(?:x1b|u001b)\\\[/i

/** module props -> exported functions whose output goes to the native renderer */
const nativeBuilders: [string, string[]][] = [
	['parseMessageMarkup', ['parseMessageMarkup', 'parseEmbedDescriptionMarkup', 'parseEmbedTitleMarkup']],
	['transformNativeBlocks', ['transformNativeBlocks', 'transformNativeInline']],
]

const strip = (text: string) => text.replace(ESCAPE, '')

/** Raw bodies of the ansi blocks in [raw] that actually contain escape codes. */
function rawBodies(raw: string): string[] {
	const bodies: string[] = []
	for (const match of raw.matchAll(ANSI_BLOCK)) {
		if (match[1].includes('\u001b')) bodies.push(match[1])
	}
	return bodies
}

/** A copy of [nodes] with stripped ansi blocks restored, or the same array if nothing changed. */
function restore(nodes: any[], bodies: string[]): any[] {
	let out: any[] | undefined
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i]
		let next = node
		if (node?.type === 'codeBlock' && String(node.lang).trim().toLowerCase() === 'ansi') {
			if (typeof node.content === 'string' && !node.content.includes('\u001b')) {
				const index = bodies.findIndex(
					body => strip(body) === node.content || strip(body).trim() === node.content.trim(),
				)
				if (index >= 0) {
					next = { ...node, content: bodies[index] }
					bodies.splice(index, 1)
				}
			}
		} else if (Array.isArray(node?.content)) {
			const content = restore(node.content, bodies)
			if (content !== node.content) next = { ...node, content }
		}
		if (next !== node) {
			out ??= nodes.slice()
			out[i] = next
		}
	}
	return out ?? nodes
}

/** Skips Discord's ANSI strip while a native content builder is running. */
function bypassStrip(): () => void {
	const proto = String.prototype as any
	const original = proto.replaceAll
	let depth = 0

	const replaceAll = function (this: string, search: any, replacement: any) {
		if (
			depth > 0 &&
			replacement === '' &&
			search instanceof RegExp &&
			DISCORD_ANSI_SOURCE.test(search.source)
		)
			return String(this)
		return original.call(this, search, replacement)
	}
	proto.replaceAll = replaceAll

	const unpatches: (() => void)[] = []
	const unsubscribes: (() => void)[] = []
	const { getModules } = revenge.modules.finders
	const { withProps } = revenge.modules.finders.filters

	for (const [marker, names] of nativeBuilders) {
		unsubscribes.push(
			getModules(withProps(marker), (exports: any) => {
				for (const name of names) {
					if (typeof exports?.[name] !== 'function') continue
					unpatches.push(
						revenge.patcher.instead(exports, name, function (this: any, args: any[], original: any) {
							if (typeof original !== 'function') return undefined
							depth++
							try {
								return Reflect.apply(original, this, args)
							} finally {
								depth--
							}
						}),
					)
				}
			}),
		)
	}

	return () => {
		for (const unsubscribe of unsubscribes) unsubscribe()
		for (const unpatch of unpatches) unpatch()
		if (proto.replaceAll === replaceAll) proto.replaceAll = original
	}
}

/** Puts the codes back into chat rows whose record was parsed before the plugin started. */
function restoreRows(): () => void {
	const { getModules } = revenge.modules.finders
	const { withName } = revenge.modules.finders.filters
	const unpatches: (() => void)[] = []
	let pending: string[] | undefined

	const unsubscribe = getModules(withName('RowManager'), (RowManager: any) => {
		const proto = RowManager?.prototype
		if (typeof proto?.generate !== 'function') return

		// before + after, not instead: other plugins already put an `instead` on generate, and a
		// second one can recurse forever (revenge-bundle-next patcher).
		unpatches.push(
			revenge.patcher.before(proto, 'generate', (args: any[]) => {
				pending = undefined
				try {
					const raw = args[0]?.rowType === 1 ? args[0].message?.content : undefined
					if (typeof raw === 'string' && raw.includes('\u001b')) {
						const bodies = rawBodies(raw)
						if (bodies.length) pending = bodies
					}
				} catch (error) {
					console.error(`${TAG} before generate failed:`, error)
				}
				return args
			}),
		)

		unpatches.push(
			revenge.patcher.after(proto, 'generate', (ret: any) => {
				const bodies = pending
				pending = undefined
				if (!bodies) return ret
				try {
					// A new array: row.message.content is Discord's per-record parse cache.
					const message = ret?.message
					if (Array.isArray(message?.content)) message.content = restore(message.content, bodies)
				} catch (error) {
					console.error(`${TAG} after generate failed:`, error)
				}
				return ret
			}),
		)
	})

	return () => {
		unsubscribe()
		for (const unpatch of unpatches) unpatch()
	}
}

export default plugin({
	start({ cleanup }) {
		try {
			cleanup(bypassStrip())
		} catch (error) {
			console.error(`${TAG} strip bypass failed:`, error)
		}
		try {
			cleanup(restoreRows())
		} catch (error) {
			console.error(`${TAG} row restore failed:`, error)
		}
	},
})
