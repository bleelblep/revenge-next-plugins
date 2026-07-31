declare namespace constants_d_exports {
  export { PluginStatus, pluginStorageDirFor };
}
/**
 * The plugin status.
 */
declare const PluginStatus: {
  PreIniting: number;
  PreInited: number;
  Initing: number;
  Inited: number;
  Starting: number;
  Started: number;
  Stopping: number;
};
/**
 * Absolute path to per-plugin storage directory.
 */
declare const pluginStorageDirFor: (id: string) => string;
//#endregion
export { constants_d_exports as n, pluginStorageDirFor as r, PluginStatus as t };