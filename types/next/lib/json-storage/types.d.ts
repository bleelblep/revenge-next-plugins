import { i as AnyObject } from "../../types-aeIN6rX0.js";
import { JsonStorage, JsonStorageOptions, t as index_d_exports } from "../json-storage.js";
//#region lib/json-storage/src/types.d.ts
declare module '@revenge-mod/plugins/types' {
  interface UnscopedPreInitPluginApi {
    jsonStorage: typeof index_d_exports;
  }
  interface PluginApiExtensionsOptions {
    jsonStorage?: AnyObject;
  }
  interface PluginOptions<O extends PluginApiExtensionsOptions> {
    jsonStorage?: JsonStorageOptions<NonNullable<O['jsonStorage']>> & {
      /**
       * File name (or relative path) of the storage document inside the
       * plugin's storage directory.
       *
       * @default 'storage.json'
       */
      file?: string;
    };
  }
  interface InitPluginApi<O extends PluginApiExtensionsOptions> {
    /**
     * The plugin JSON storage.
     */
    jsonStorage: JsonStorage<NonNullable<O['jsonStorage']>>;
  }
}