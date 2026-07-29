// Ambient types for Revenge Next's external-plugin runtime.
//
// There is no public spec for this API. The core shapes (plugin(), jsonStorage, patcher,
// jsx runtime) were reverse-engineered by downloading and reading three of PalmDevs' own
// built plugin zips from https://copyparty.palmdevs.me/revenge-plugin-repo/
// (palmdevs.silent-typing, palmdevs.hide-blocked-messages, palmdevs.flashbang).
//
// The `modules.finders` section below was corrected against a real on-device crash log
// (an "undefined is not a function" during preInitPlugin, from a guessed `withStoreName`
// filter that doesn't exist under `modules.finders.filters`) by reading the actual source
// of revenge-mod/revenge-bundle-next (lib/modules/src/finders/**, lib/discord/src/flux/stores.ts).
// That source is the external plugin host's own implementation, so these shapes are
// confirmed-accurate for lookupModule/lookupModules/getModules/withProps/withName/
// withDependencies/Stores. Anything else (haptics, alerts, toasts, Design/Tokens) is still
// a best-effort guess by analogy with the classic Revenge/Vendetta API our other plugins
// use, and may need correcting once tested on-device.

import type * as ReactTypes from 'react'
import type * as ReactNativeTypes from 'react-native'

// The "revenge/jsx-runtime" module itself lives in types/jsx-runtime.d.ts, resolved via the
// tsconfig `paths` mapping -- TypeScript's jsx-runtime resolution needs an actual resolvable
// file for jsxImportSource, not just an ambient `declare module` block here.

declare global {
	// ---- plugin() lifecycle -------------------------------------------------

	interface RevengeJsonStorageApi<S> {
		/** Synchronous last-known value. Prefer `use()` inside components. */
		cache: S
		/** Reactive read — re-renders the calling component when the value changes. */
		use(): S
		set(patch: Partial<S>): void
		subscribe(
			cb: (value: S, mode: RevengeJsonStorageUpdateMode) => void,
		): () => void
	}

	interface RevengePluginSelf {
		requireReload(): void
		disable(): void
		/** True if the plugin was enabled after the client had already finished starting up. */
		startedLate: boolean
	}

	interface RevengePluginStartApi<S> {
		/** Register one or more cleanup callbacks, run automatically on stop/unload. */
		cleanup(...fns: Array<() => void>): void
		jsonStorage: RevengeJsonStorageApi<S>
		plugin: RevengePluginSelf
	}

	interface RevengePluginStopApi {
		plugin: RevengePluginSelf
	}

	interface RevengePluginConfig<S = Record<string, unknown>> {
		jsonStorage?: { load: boolean; default: S }
		start?(api: RevengePluginStartApi<S>): void
		stop?(api: RevengePluginStopApi): void
		SettingsComponent?: ReactTypes.FC<{ api: RevengePluginStartApi<S> }>
	}

	/** Global factory injected by the Revenge Next host at plugin-load time. */
	function plugin<S = Record<string, unknown>>(
		config: RevengePluginConfig<S>,
	): unknown

	// ---- revenge.* namespace --------------------------------------------------

	const enum RevengeJsonStorageUpdateMode {
		Load = 0,
		Set = 1,
	}

	interface RevengeModuleFilter<T = any> {
		(id: number, exports?: unknown): boolean
		key: string
		and(other: RevengeModuleFilter<any>): RevengeModuleFilter<T>
		or(other: RevengeModuleFilter<any>): RevengeModuleFilter<T>
	}

	interface RevengeLookupOptions {
		/** Use cached lookup results. @default true */
		cached?: boolean
		/** Initialize matching uninitialized modules. @default true */
		initialize?: boolean
		/** Return the whole module exports (with `.default` intact) instead of unwrapping to
		 *  the default export when the filter matched via the default export. Needed when you
		 *  intend to patch `.default` on the module itself rather than call the returned value
		 *  directly. @default false */
		returnNamespace?: boolean
	}

	interface RevengePatcherApi {
		before<Self = any>(
			obj: any,
			method: string,
			cb: (args: unknown[], self: Self) => unknown[] | void,
		): () => void
		after<Self = any>(
			obj: any,
			method: string,
			cb: (args: unknown[], ret: unknown, self: Self) => unknown,
		): () => void
		instead<Self = any>(
			obj: any,
			method: string,
			cb: (args: unknown[], orig: (...a: unknown[]) => unknown, self: Self) => unknown,
		): () => void
	}

	interface RevengeModuleFindersApi {
		filters: {
			/** Confirmed live (revenge-bundle-next source): matches modules whose exports have
			 *  every listed property. */
			withProps<T = any>(...props: string[]): RevengeModuleFilter<T>
			withoutProps<T = any>(...props: string[]): RevengeModuleFilter<T>
			withSingleProp<T = any>(prop: string): RevengeModuleFilter<T>
			/** Confirmed live: matches a module whose exports (or default export) has
			 *  `.name === name` — for named function components/classes. NOT a Flux-store-name
			 *  lookup (there is no such filter here — use `revenge.discord.flux.Stores.<Name>`
			 *  for that instead). */
			withName<T = any>(name: string): RevengeModuleFilter<T>
			withDependencies(deps: unknown[]): RevengeModuleFilter<any>
		}
		/** Subscribes to every currently-loaded and future module matching `filter`. */
		getModules<T = any>(
			filter: RevengeModuleFilter<T>,
			cb: (mod: T, id: number) => void,
			options?: RevengeLookupOptions & { max?: number },
		): () => void
		/** One-shot synchronous lookup of the first match. Returns `[exports, id]`, or `[]`
		 *  (empty array, NOT undefined) if nothing matched — `?.[0]` still works either way. */
		lookupModule<T = any>(
			filter: RevengeModuleFilter<T>,
			options?: RevengeLookupOptions,
		): [T, number] | []
		/** Generator over every match — NOT an array. Iterate with `for...of` (or
		 *  `[...lookupModules(filter)]` to collect eagerly) and destructure each
		 *  `[exports, id]` yielded pair. */
		lookupModules<T = any>(
			filter: RevengeModuleFilter<T>,
			options?: RevengeLookupOptions,
		): Generator<[T, number], undefined>
	}

	interface RevengeDesignApi {
		TableRowGroup: ReactTypes.ComponentType<{ children?: ReactTypes.ReactNode; title?: string }>
		TableRow: ReactTypes.ComponentType<Record<string, any>>
		TableSwitchRow: ReactTypes.ComponentType<{
			icon?: ReactTypes.ReactNode
			label: string
			subLabel?: string
			value: boolean
			onValueChange: (value: boolean) => void
		}>
		TableRadioRow: ReactTypes.ComponentType<Record<string, any>>
		TableRowIcon: ReactTypes.ComponentType<Record<string, any>>
		[key: string]: ReactTypes.ComponentType<any>
	}

	interface RevengeToastActionCreators {
		open(opts: Record<string, unknown>): void
		close(opts?: Record<string, unknown>): void
	}

	interface RevengeAlertActionCreators {
		openAlert?(...args: unknown[]): void
		showConfirmationAlert?(opts: Record<string, unknown>): void
		[key: string]: unknown
	}

	const revenge: {
		react: {
			React: typeof ReactTypes
			ReactNative: typeof ReactNativeTypes
			ReactJSXRuntime: {
				jsx: (type: any, props: any, key?: any) => any
				jsxs: (type: any, props: any, key?: any) => any
			}
			/** Revenge-specific native app lifecycle helpers (distinct from ReactNative). */
			native: {
				onRunApplicationFinished(cb: () => void): void
			}
		}
		patcher: RevengePatcherApi
		modules: {
			finders: RevengeModuleFindersApi
		}
		discord: {
			flux: {
				/** Confirmed live (both the hide-blocked-messages sample and
				 *  revenge-bundle-next's own `lib/discord/src/flux/stores.ts`): a proxy keyed
				 *  by Flux store name, e.g. `Stores.GuildStore`, `Stores.ChannelStore`. Plain
				 *  property access — safe even for an unregistered name (`undefined`, not a
				 *  throw). Prefer this over any module-finder-based store lookup. */
				Stores: Record<string, any>
				onFluxEventDispatched(
					event: string,
					cb: (...args: unknown[]) => void,
				): () => void
			}
			design: {
				Design: RevengeDesignApi
				/** Flat, already-resolved colour tokens. Best-effort — the old classic-Revenge
				 *  equivalent needed a two-tier semanticColors + resolver dance; assumed here to
				 *  be simplified into direct string values, unconfirmed. */
				Tokens: Record<string, string>
				/** Flat brand/status palette (classic Revenge's `rawColors`). */
				RawColors: Record<string, string>
			}
			actions: {
				ToastActionCreators: RevengeToastActionCreators
				AlertActionCreators: RevengeAlertActionCreators
			}
			common: {
				Constants: Record<string, any>
				/** Discord's bundled moment.js instance (classic `@vendetta/metro/common`'s `moment`). */
				moment: ((...args: unknown[]) => any) & { isMoment?: (value: unknown) => boolean }
				/** Discord's bundled chroma-js instance. */
				chroma: (...args: unknown[]) => any
			}
			/** Unconfirmed -- not found in a quick pass over revenge-bundle-next's source, and
			 *  no reference sample used haptics. Every call site wraps this in try/catch. */
			haptics: {
				trigger(type?: string): void
			}
		}
		components: {
			Page: ReactTypes.ComponentType<{ children?: ReactTypes.ReactNode }>
			TableRowAssetIcon: ReactTypes.ComponentType<{ name: string }>
			getAssetIDByName(name: string): unknown
		}
		utils: {
			callback: {
				noop: (...args: unknown[]) => void
			}
			proxy: {
				unproxify(obj: unknown): void
			}
			react: {
				/** Walks a rendered element/fiber tree for the first node matching `predicate`
				 *  (classic `@vendetta/utils`'s `findInReactTree`). */
				findInReactTree(tree: unknown, predicate: (node: any) => boolean): any
			}
			toast: {
				show(content: string): void
			}
		}
		jsonStorage: {
			JsonStorageUpdateMode: typeof RevengeJsonStorageUpdateMode
		}
	}

	/** Access to React Native's native module bridge, as used by `revenge.react.native`. */
	const nativeModuleProxy: Record<string, any>
}

export {}
