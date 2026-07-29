// Ambient types for Revenge Next's external-plugin runtime.
//
// There is no public spec for this API. Every shape here was reverse-engineered by
// downloading and reading three of PalmDevs' own built plugin zips from
// https://copyparty.palmdevs.me/revenge-plugin-repo/ (palmdevs.silent-typing,
// palmdevs.hide-blocked-messages, palmdevs.flashbang) and reading the minified output.
// Anything not exercised by those three samples is a best-effort guess by analogy with
// the equivalent classic Revenge/Vendetta API (@vendetta/*) our other plugins use.
// Expect to correct this file once plugins are actually tested on-device.

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
		and(other: RevengeModuleFilter<any>): RevengeModuleFilter<T>
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
			withProps<T = any>(...props: string[]): RevengeModuleFilter<T>
			withName<T = any>(name: string): RevengeModuleFilter<T>
			/** Not observed in any of the 3 samples — modelled on classic `findByStoreName`. */
			withStoreName<T = any>(name: string): RevengeModuleFilter<T>
			/** Not observed — modelled on classic `findByTypeNameAll`. */
			withTypeName<T = any>(name: string): RevengeModuleFilter<T>
			/** Not observed — modelled on classic `find(predicate)`. */
			withPredicate<T = any>(fn: (mod: any) => boolean): RevengeModuleFilter<T>
			withDependencies(deps: unknown[]): RevengeModuleFilter<any>
		}
		/** Subscribes to every currently-loaded and future module matching `filter`. */
		getModules<T = any>(
			filter: RevengeModuleFilter<T>,
			cb: (mod: T) => void,
		): () => void
		/** One-shot synchronous lookup; returns `[module, moduleId]` or undefined. */
		lookupModule<T = any>(filter: RevengeModuleFilter<T>): [T, number] | undefined
		/** One-shot synchronous lookup of every match (classic `findByTypeNameAll`-style). */
		lookupModules<T = any>(filter: RevengeModuleFilter<T>): T[]
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
