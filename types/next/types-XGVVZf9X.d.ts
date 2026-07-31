import { x as index_d_exports } from "./types-aeIN6rX0.js";
import { a as utils_d_exports$1, c as index_d_exports$1 } from "./utils-DwgDyNWM.js";
import { i as react_navigation_d_exports } from "./react-navigation-C0E6Cr3d.js";
import { i as actions_d_exports } from "./actions-DcU7zGHf.js";
import { s as index_d_exports$2 } from "./index-BmcfkGzZ.js";
import { r as design_d_exports } from "./design-CNa6e9al.js";
import { t as index_d_exports$3 } from "./index-DBvWVzVG.js";
import { t as index_d_exports$4 } from "./index-Dtzxhgco.js";
import { n as main_tabs_v2_d_exports } from "./main_tabs_v2-NT-UEEvf.js";
import { a as index_d_exports$5 } from "./index-DTuGwNI-.js";
import { n as renderer_d_exports } from "./renderer-C_kr7Ys6.js";
import { s as native_d_exports } from "./native-h0PRx7r9.js";
import { t as finders_d_exports } from "./finders-CDv3HCbb.js";
import { n as subscriptions_d_exports } from "./subscriptions-D0JT7VA9.js";
import { t as browserify_d_exports } from "./browserify-DJ5AyWx4.js";
import { n as react_native_clipboard_d_exports } from "./react-native-clipboard-C4-MMieZ.js";
import { n as react_native_safe_area_context_d_exports } from "./react-native-safe-area-context-DULPjWwC.js";
import { n as shopify_d_exports } from "./shopify-Bvy25Ylf.js";
import { i as fs_d_exports } from "./fs-DTkk2z5Y.js";
import { u as index_d_exports$6 } from "./index-BbHuAolp.js";
import { n as constants_d_exports } from "./constants-DyYVPecI.js";
import { s as index_d_exports$7 } from "./index-B_2nil1-.js";
import { t as index_d_exports$8 } from "./index-CLY5DbuK.js";
import { FunctionComponent } from "react";
import * as PluginApiReact_ from "@revenge-mod/react";
//#region lib/plugins/src/apis/discord.d.ts
interface PluginApiDiscord {
  actions: PluginApiDiscord.Actions;
  /**
   * This submodule is only available after the index module (ID 0) is initialized.
   * Attempting to access it before then will throw an error.
   */
  common: PluginApiDiscord.Common;
  design: PluginApiDiscord.Design;
  flux: PluginApiDiscord.Flux;
  modules: PluginApiDiscord.Modules;
  native: PluginApiDiscord.Native;
  utils: PluginApiDiscord.Utils;
}
declare namespace PluginApiDiscord {
  type Actions = typeof actions_d_exports;
  type Common = typeof index_d_exports$2;
  type Design = typeof design_d_exports;
  type Flux = typeof index_d_exports$4;
  type Native = typeof native_d_exports;
  interface Utils {
    finders: typeof finders_d_exports;
    metro: {
      subscriptions: typeof subscriptions_d_exports;
    };
  }
  interface Modules {
    mainTabsV2: typeof main_tabs_v2_d_exports;
    settings: typeof index_d_exports$5 & typeof renderer_d_exports;
  }
}
//#endregion
//#region lib/plugins/src/apis/externals.d.ts
interface PluginApiExternals {
  Browserify: typeof browserify_d_exports;
  ReactNativeClipboard: typeof react_native_clipboard_d_exports;
  ReactNativeSafeAreaContext: typeof react_native_safe_area_context_d_exports;
  ReactNavigation: typeof react_navigation_d_exports;
  Shopify: typeof shopify_d_exports;
}
//#endregion
//#region lib/plugins/src/apis/modules.d.ts
interface PluginApiModules {
  finders: PluginApiModulesFinders;
  metro: PluginApiModulesMetro;
  native: PluginApiModulesNative;
}
type PluginApiModulesNative = typeof index_d_exports$6 & {
  fs: typeof fs_d_exports;
};
type PluginApiModulesMetro = typeof utils_d_exports$1 & typeof index_d_exports$1;
type PluginApiModulesFinders = typeof index_d_exports$3 & {
  filters: typeof index_d_exports;
};
declare namespace utils_d_exports {
  export { formatVersion };
}
/**
 * Formats a plugin version for display.
 */
declare const formatVersion: (version: PluginVersion) => string;
//#endregion
//#region lib/plugins/src/apis/plugins.d.ts
interface PluginApiPlugins {
  utils: typeof utils_d_exports;
  constants: typeof constants_d_exports;
}
//#endregion
//#region lib/plugins/src/apis/react.d.ts
type PluginApiReact = typeof PluginApiReact_ & {
  jsxRuntime: typeof index_d_exports$7;
  native: typeof index_d_exports$8;
};
//#endregion
//#region lib/plugins/src/types.d.ts
interface PluginApiExtensionsOptions {}
/**
 * The unscoped plugin API (very limited). This API is available as a global for plugins.
 * Available in the `preInit` phase.
 */
interface UnscopedPreInitPluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> {
  modules: PluginApiModules;
  patcher: typeof import('@revenge-mod/patcher');
  plugins: PluginApiPlugins;
  react: PluginApiReact;
  assets: typeof import('@revenge-mod/assets');
  externals: PluginApiExternals;
  components: typeof import('@revenge-mod/components');
  discord: PluginApiDiscord;
}
/**
 * The unscoped plugin API (limited). This API is available as a global for plugins.
 * Available in the `init` phase.
 */
interface UnscopedInitPluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends UnscopedPreInitPluginApi<O> {}
/**
 * The unscoped plugin API. This API is available as a global for plugins.
 * Available in the `start` and `stop` phase.
 */
interface UnscopedPluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends UnscopedInitPluginApi<O> {}
/**
 * A cleanup function that can be registered to be called when the plugin is stopped.
 */
type PluginCleanup = () => any;
/**
 * Registers cleanup functions to be called when the plugin is stopped.
 *
 * @example
 * ```ts
 * cleanup(unpatch)
 * cleanup(unsub)
 * ```
 */
type PluginCleanupApi = (...fns: PluginCleanup[]) => void;
/**
 * Decorates the plugin API for the dependents of the plugin with a decorator function.
 * @param decorator The decorator function to apply.
 *
 * @example
 * ```ts
 * // Your plugin's `init` function:
 * init({ decorate }) {
 *   decorate((plugin, options) => {
 *     plugin.api.customMethod = () => {
 *       console.log('Custom method called!')
 *     }
 *   })
 * }
 *
 * // In another plugin, with your plugin as a dependency:
 * init({ customMethod }) {
 *   customMethod() // Logs: "Custom method called!"
 * }
 * ```
 */
type PluginDecorateApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions, S extends keyof PluginApiInLifecycleMap<O> = keyof PluginApiInLifecycleMap<O>> = (decorator: PluginApiDecorator<O, S>) => void;
/**
 * The decorator function that modifies the plugin API.
 *
 * @param plugin The plugin being decorated.
 * @param options The options the plugin passed.
 *
 * @see {@link PluginDecorateApi}
 */
type PluginApiDecorator<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions, S extends keyof PluginApiInLifecycleMap<O> = keyof PluginApiInLifecycleMap<O>> = (plugin: Plugin<O, S>, options: O) => void;
/**
 * The plugin API (very limited).
 * Available in the `preInit` phase.
 */
interface PreInitPluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> {
  decorate: PluginDecorateApi<O, 'PreInit'>;
  unscoped: UnscopedPreInitPluginApi;
  cleanup: PluginCleanupApi;
  plugin: Plugin<O, 'PreInit'>;
}
/**
 * The plugin API (limited).
 * Available in the `init` phase.
 */
interface InitPluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends PreInitPluginApi<O> {
  decorate: PluginDecorateApi<O, 'Init'>;
  unscoped: UnscopedInitPluginApi;
  plugin: Plugin<O, 'Init'>;
}
/**
 * The plugin API.
 * Available in the `start` and `stop` phase.
 */
interface PluginApi<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends InitPluginApi<O> {
  decorate: PluginDecorateApi<O, 'Start'>;
  unscoped: UnscopedPluginApi;
  plugin: Plugin<O, 'Start'>;
}
/**
 * The plugin manifest.
 */
interface PluginManifest {
  /**
   * The manifest format version.
   */
  format: number;
  /**
   * The unique identifier for the plugin.
   */
  id: string;
  /**
   * The name of the plugin.
   */
  name: string;
  /**
   * The author of the plugin.
   */
  author: string;
  /**
   * The description of the plugin.
   */
  description: string;
  /**
   * The icon of the plugin. An asset name, or a `data:` URL.
   */
  icon?: string;
  /**
   * The dependencies of the plugin, keyed by plugin ID.
   */
  dependencies?: Record<string, PluginDependency>;
  /**
   * The plugin's version.
   */
  version: PluginVersion;
}
interface PluginVersion {
  nums: number[];
  label?: string;
}
/**
 * A dependency specification. The dependency's plugin ID is the key in {@link PluginManifest.dependencies}.
 */
interface PluginDependency {
  /**
   * Version range the dependency must satisfy.
   */
  version?: string;
  /**
   * Whether this dependency can be optionally linked.
   */
  optional?: boolean;
}
interface PluginOptions<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends PluginLifecycles<O> {
  SettingsComponent?: PluginSettingsComponent<O>;
}
/**
 * A factory that lazily creates the plugin options.
 *
 * Only passed when the options (and lifecycles) must only be created right before the plugin runs,
 * for example to avoid evaluating external plugin code until it is actually used.
 */
type PluginOptionsFactory<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> = () => PluginOptions<O>;
/**
 * The plugin lifecycles.
 */
interface PluginLifecycles<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> {
  /**
   * Runs as soon as possible with very limited APIs.
   * Before the index module (module 0)'s factory is run.
   *
   * @param api Plugin API (very limited).
   */
  preInit?: (this: Plugin<O, 'PreInit'>, api: PreInitPluginApi<O>) => any;
  /**
   * Runs as soon as all important modules are initialized.
   * After the index module (module 0)'s factory is run.
   *
   * @param api Plugin API (limited).
   */
  init?: (this: Plugin<O, 'Init'>, api: InitPluginApi<O>) => any;
  /**
   * Runs when the plugin can be started with all APIs available.
   *
   * @param api Plugin API.
   */
  start?: (this: Plugin<O, 'Start'>, api: PluginApi<O>) => any;
  /**
   * Runs when the plugin is stopped.
   *
   * @param api Plugin API.
   */
  stop?: (this: Plugin<O, 'Start'>, api: PluginApi<O>) => any;
}
interface Plugin<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions, S extends keyof PluginApiInLifecycleMap<O> = keyof PluginApiInLifecycleMap<O>> {
  manifest: PluginManifest;
  lifecycles: PluginLifecycles<O>;
  /**
   * @see {@link PluginStatus}
   */
  status: number;
  /**
   * Whether this plugin was started late (after the `start` phase).
   * This can happen when the plugin is just installed, or the user just started it in the UI.
   */
  startedLate: boolean;
  /**
   * Errors encountered during the plugin lifecycles.
   */
  errors: readonly unknown[];
  /**
   * Reports an error encountered during the plugin's execution.
   */
  reportError(e: unknown): void;
  SettingsComponent?: PluginSettingsComponent<O>;
  /**
   * Disable the plugin.
   * This will also stop the plugin if it is running.
   */
  disable(this: Plugin<O, S>): Promise<void>;
  /**
   * Stop the plugin.
   */
  stop(this: Plugin<O, S>): Promise<void>;
  /**
   * Marks this plugin as requiring a reload to apply changes.
   */
  requireReload(this: Plugin<O, S>): void;
  /**
   * The plugin API.
   *
   * Not recommended to use this directly.
   */
  api: PluginApiInLifecycleMap<O>[S];
}
/**
 * The plugin API in a specific stage.
 */
type PluginApiInLifecycleMap<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> = {
  Register: undefined;
  PreInit: PreInitPluginApi<O>;
  Init: InitPluginApi<O>;
  Start: PluginApi<O>;
};
/**
 * The component that renders the plugin settings page.
 */
interface PluginSettingsComponent<O extends PluginApiExtensionsOptions = PluginApiExtensionsOptions> extends FunctionComponent<{
  api: PluginApi<O>;
}> {}
declare module '@revenge-mod/modules/native' {
  interface NativeMethods {
    'revenge.plugins.getConstants': [[], {
      storageRootPath: string;
    }];
  }
}
//#endregion
export { PreInitPluginApi as _, PluginApiExtensionsOptions as a, UnscopedPreInitPluginApi as b, PluginCleanupApi as c, PluginLifecycles as d, PluginManifest as f, PluginVersion as g, PluginSettingsComponent as h, PluginApiDecorator as i, PluginDecorateApi as l, PluginOptionsFactory as m, Plugin as n, PluginApiInLifecycleMap as o, PluginOptions as p, PluginApi as r, PluginCleanup as s, InitPluginApi as t, PluginDependency as u, UnscopedInitPluginApi as v, formatVersion as x, UnscopedPluginApi as y };