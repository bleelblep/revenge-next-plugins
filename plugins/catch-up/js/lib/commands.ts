/**
 * A slash command registry, because Revenge Next does not have one.
 *
 * Classic Revenge and Vendetta shipped `vendetta.commands.registerCommand`. Revenge Next exposes
 * nothing equivalent — not in `@revenge-mod/discord`, not in the generated types, not in the
 * docs — so this file reimplements the small part of it a plugin actually needs. It is kept free
 * of anything Catch Up-specific so it can move to a shared place once a second plugin wants a
 * command.
 *
 * ## How Discord's own commands work
 *
 * Built-in commands — the ones that are not from a bot, like /shrug and /tableflip — live in a
 * plain array exported as `BUILT_IN_COMMANDS` from
 * `modules/application_commands/ApplicationCommandBuiltIns.tsx`. Pushing a well-formed entry into
 * that array is all registration is.
 *
 * ## Why this waits rather than looks
 *
 * The first version used a bare `lookupModule` and found nothing, because `lookupModule` is
 * one-shot over *already initialized* modules and the command modules are not initialized at
 * `start()` — porting rule 3, exactly as written. Nothing appeared, and the only reason that was
 * a five-minute diagnosis rather than an evening is that the Debug page reports whether the
 * registry was found rather than whether registration was attempted.
 *
 * So registration is now asynchronous by design: `registerCommand` records what you want, and the
 * entry is pushed the moment the module shows up. Two routes are tried, better one first:
 *
 * 1. `getModuleWithImportedPath`, which resolves a module by the path Discord's own bundle
 *    records. It is a map lookup plus a `fileFinishedImporting` subscription — no filter, no
 *    result cache, no `max`, and no miss-caching to poison.
 * 2. A `lookupModules` + `waitForModules` pair on `withProps('BUILT_IN_COMMANDS')`, in case the
 *    path moves in a later Discord build.
 *
 * Whichever answers first wins, and the Debug page says which.
 */

export enum OptionType {
	String = 3,
	Integer = 4,
	Boolean = 5,
	Channel = 7,
}

export interface CommandOption {
	name: string
	description: string
	type: OptionType
	required?: boolean
}

export interface CommandArgument {
	name: string
	value: unknown
}

export interface CommandContext {
	channel?: { id: string; name?: string; guild_id?: string }
	guild?: { id: string }
}

export interface CommandDefinition {
	name: string
	description: string
	options?: CommandOption[]
	execute(
		args: CommandArgument[],
		context: CommandContext,
	): void | Promise<void>
}

/** The path Discord's bundle records for the module holding the built-in command list. */
const BUILT_INS_PATH =
	'modules/application_commands/ApplicationCommandBuiltIns.tsx'

/** Discord's own id for commands that come from the client rather than an application. */
const BUILT_IN_APPLICATION_ID = '-1'
/** ApplicationCommandType.CHAT_INPUT */
const CHAT_INPUT = 1
/** ApplicationCommandInputType.BUILT_IN */
const INPUT_BUILT_IN = 0

const status = {
	found: false,
	via: '' as '' | 'imported-path' | 'props',
	registered: [] as string[],
}

export function registryStatus(): {
	found: boolean
	via: string
	registered: string[]
} {
	return {
		found: status.found,
		via: status.via,
		registered: [...status.registered],
	}
}

let registry: any[] | undefined
/** Entries waiting for the registry to turn up. */
const queued = new Map<string, any>()
let watching = false
const teardown: Array<() => void> = []

function adopt(array: unknown, via: 'imported-path' | 'props'): boolean {
	if (registry || !Array.isArray(array)) return false

	registry = array as any[]
	status.found = true
	status.via = via
	console.log(
		`[CatchUp] command registry found via ${via} (${registry.length} built-ins)`,
	)

	// Anything registered before the module arrived goes in now.
	for (const [id, entry] of queued) {
		const stale = registry.findIndex(command => command?.id === id)
		if (stale !== -1) registry.splice(stale, 1)
		registry.push(entry)
		console.log(`[CatchUp] registered /${entry.name}`)
	}
	queued.clear()
	return true
}

/** Pulls `BUILT_IN_COMMANDS` off a module namespace, checking `default` too (porting rule 3). */
function extract(mod: any): unknown {
	if (Array.isArray(mod?.BUILT_IN_COMMANDS)) return mod.BUILT_IN_COMMANDS
	if (Array.isArray(mod?.default?.BUILT_IN_COMMANDS))
		return mod.default.BUILT_IN_COMMANDS
	return undefined
}

/**
 * Started once, from `start()`. Never at module scope — a finder during preInit is how this
 * repository poisoned the Design proxy for a whole session (porting rule 1).
 */
function watchForRegistry() {
	if (watching) return
	watching = true

	// Route 1: by source path. The namespace moved between Revenge builds, and the short one
	// throws rather than returning undefined, so try both and let either answer.
	try {
		const finders =
			(revenge.discord.utils as any)?.modules?.finders ??
			(revenge.discord.utils as any)?.finders
		if (typeof finders?.getModuleWithImportedPath === 'function') {
			finders.getModuleWithImportedPath(BUILT_INS_PATH, (exports: any) => {
				adopt(extract(exports), 'imported-path')
			})
		} else {
			console.log(
				'[CatchUp] no getModuleWithImportedPath on this build; falling back to props',
			)
		}
	} catch (error) {
		console.error('[CatchUp] imported-path lookup threw:', error)
	}

	// Route 2: by shape, as a standing subscription rather than a one-shot look.
	try {
		const { lookupModules, waitForModules } = revenge.modules.finders
		const { withProps } = revenge.modules.finders.filters
		const filter = withProps('BUILT_IN_COMMANDS')

		for (const [exports] of lookupModules(filter)) {
			if (adopt(extract(exports), 'props')) return
		}

		// `unsub` is declared first because the callback references it.
		let unsub: (() => void) | undefined
		unsub = waitForModules(filter, (exports: any) => {
			if (adopt(extract(exports), 'props')) unsub?.()
		})
		teardown.push(() => unsub?.())
	} catch (error) {
		console.error('[CatchUp] props lookup threw:', error)
	}
}

/**
 * Discord's autocomplete reads several name and description fields rather than one, and a missing
 * one shows as a blank row rather than an error. They are all filled from the same two strings.
 */
function buildEntry(definition: CommandDefinition, id: string) {
	return {
		id,
		applicationId: BUILT_IN_APPLICATION_ID,
		type: CHAT_INPUT,
		inputType: INPUT_BUILT_IN,
		name: definition.name,
		displayName: definition.name,
		untranslatedName: definition.name,
		description: definition.description,
		displayDescription: definition.description,
		untranslatedDescription: definition.description,
		options: (definition.options ?? []).map(option => ({
			...option,
			displayName: option.name,
			displayDescription: option.description,
			required: option.required ?? false,
		})),
		execute: definition.execute,
	}
}

/**
 * Returns an unregister callback immediately. The command itself lands whenever the registry
 * does, which may be after this returns.
 */
export function registerCommand(definition: CommandDefinition): () => void {
	watchForRegistry()

	const id = `bleelblep-${definition.name}`
	const entry = buildEntry(definition, id)
	status.registered.push(definition.name)

	if (registry) {
		// Re-registering after a reload would otherwise show the command twice.
		const stale = registry.findIndex(command => command?.id === id)
		if (stale !== -1) registry.splice(stale, 1)
		registry.push(entry)
		console.log(`[CatchUp] registered /${definition.name}`)
	} else {
		queued.set(id, entry)
	}

	return () => {
		queued.delete(id)
		if (registry) {
			const index = registry.findIndex(command => command?.id === id)
			if (index !== -1) registry.splice(index, 1)
		}
		status.registered = status.registered.filter(
			name => name !== definition.name,
		)
		for (const stop of teardown.splice(0)) {
			try {
				stop()
			} catch {
				/* a subscription that is already gone is nothing to report */
			}
		}
	}
}

/** Reads one option out of the argument list Discord hands `execute`. */
export function argument<T>(
	args: CommandArgument[],
	name: string,
	fallback: T,
): T {
	const found = args?.find(arg => arg?.name === name)
	return found?.value === undefined ? fallback : (found.value as T)
}
