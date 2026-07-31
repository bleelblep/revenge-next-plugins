import { a as DeepPartial, i as AnyObject, s as If } from "../types-aeIN6rX0.js";
declare namespace index_d_exports {
  export { JsonStorage, JsonStorageOptions, JsonStorageSubscription, JsonStorageUpdateMode, UseJsonStorageFilter, getJsonStorage, pluginStoragePathFor };
}
/**
 * Get the storage path for a plugin's JSON storage document.
 *
 * @param id The plugin ID.
 * @param file The file name (or relative path) of the storage document inside the plugin's storage directory.
 */
declare const pluginStoragePathFor: (id: string, file?: string) => string;
type JsonStorageSubscription<T extends AnyObject = AnyObject> = (update: DeepPartial<T>, mode: (typeof JsonStorageUpdateMode)[keyof typeof JsonStorageUpdateMode]) => void;
declare const JsonStorageUpdateMode: {
  /**
   * The update will be merged into the existing storage.
   */
  readonly Merge: 0;
  /**
   * The update will replace the existing storage.
   */
  readonly Replace: 1;
  /**
   * Same behavior as {@link JsonStorageUpdateMode.Replace}, but for the intial load of the storage.
   */
  readonly Load: 2;
};
/**
 * Create a new JSON storage object.
 *
 * @param path The path to the storage document.
 * - Relative paths resolve against the app data directory (`/data/data/<pkg>` on Android).
 *   Use `files/...` for app data or `cache/...` for cache on Android.
 * - Absolute paths are used as-is.
 *
 * @param options Options for the storage.
 */
declare function JsonStorage<T extends AnyObject>(this: JsonStorage<T>, path: string, options?: JsonStorageOptions<T>): void;
/**
 * Get a JSON storage object for a given path.
 *
 * @param path The path to the storage document.
 * - Relative paths resolve against the app data directory (`/data/data/<pkg>` on Android).
 *   Use `files/...` for app data or `cache/...` for cache on Android.
 * - Absolute paths are used as-is.
 */
declare function getJsonStorage<T extends AnyObject = AnyObject>(path: string, options?: JsonStorageOptions<T>): JsonStorage<T>;
interface JsonStorageOptions<T extends AnyObject = AnyObject> {
  /**
   * The default value to use for the storage. This will also be used for cache.
   *
   * @default {}
   */
  default?: T;
  /**
   * Automatically load the storage after creating the instance.
   *
   * @default false
   */
  load?: boolean;
}
type UseJsonStorageFilter<T extends AnyObject = AnyObject> = (...params: Parameters<JsonStorageSubscription<T>>) => any;
interface JsonStorage<T extends AnyObject> {
  /**
   * Whether the storage has been loaded. If the storage is not loaded, `storage.cache` may be `undefined`.
   * If you have `options.default` set, you can use this property to check if `storage.cache` is the default value or not.
   */
  loaded: boolean;
  /**
   * The cached storage object. Set once `get()` is called, and updated on `set()`.
   * You should not modify this directly.
   */
  cache?: T | AnyObject;
  /**
   * Use the storage in a React component. The component will re-render when the storage is updated.
   *
   * This can only be used in the `init` stage or later, as it requires React to be initialized.
   *
   * @example
   * ```tsx
   * type Settings = { key: boolean, nested: { key: boolean } }
   *
   * const SettingsStorage = getJsonStorage<Settings>('settings.json')
   *
   * const MyComponent = () => {
   *   // Re-renders every time any of the keys in the settings object change
   *   const settings = SettingsStorage.use()
   *   // const settings: Settings | undefined
   *
   *   // ...
   * }
   *
   * const MyComponent2 = () => {
   *  // Re-renders every time the new value matches the filter
   *  const settings = SettingsStorage.use(val => val.key !== undefined)
   *  // const settings: Settings | undefined
   *
   *  // ...
   * }
   */
  use(filter?: UseJsonStorageFilter<T>): T | undefined;
  /**
   * Subscribe to storage updates.
   *
   * @param callback The callback to call when the storage is updated.
   * @returns A function to unsubscribe.
   */
  subscribe(callback: JsonStorageSubscription<T>): () => void;
  /**
   * Get the storage.
   */
  get(): Promise<T>;
  /**
   * Set the storage.
   *
   * @param value The value to merge into the storage.
   * @param replace If true, replaces the entire storage instead of merging.
   */
  set(value: DeepPartial<T>): Promise<void>;
  set<Replace extends boolean>(value: If<Replace, T, DeepPartial<T>>, replace: Replace): Promise<void>;
  /**
   * Whether the storage is exists.
   */
  exists(): Promise<boolean>;
  /**
   * Delete the storage.
   */
  delete(): Promise<boolean>;
}
//#endregion
export { JsonStorage, JsonStorageOptions, JsonStorageSubscription, JsonStorageUpdateMode, UseJsonStorageFilter, getJsonStorage, pluginStoragePathFor, index_d_exports as t };