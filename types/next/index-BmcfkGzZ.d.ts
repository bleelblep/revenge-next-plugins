import { n as Metro } from "./types-aeIN6rX0.js";
import { t as DiscordModules } from "./index-CkgRHGNv.js";
import { r as flux_d_exports } from "./flux-tTtvUBgI.js";
import { t as ImportTrackerModuleId } from "./import-tracker-Cno9jlVU.js";
import "./dispatcher-BBcgRrq4.js";
import { n as utils_d_exports } from "./utils-DvuSXsb-.js";
//#region lib/discord/src/preinit.d.ts
declare const AppStartPerformance: DiscordModules.AppStartPerformance;
declare namespace index_d_exports {
  export { AppStartPerformance, Constants, ConstantsModuleId, ImportTrackerModuleId, Logger, LoggerModuleId, Tokens, TokensModuleId, flux_d_exports as flux, utils_d_exports as utils };
}
declare const Logger: typeof DiscordModules.Logger, LoggerModuleId: number;
declare const Tokens: any, TokensModuleId: number;
/**
 * If you need to use this ID, unproxify {@link Constants} first.
 *
 * ```js
 * preinit() {
 *   unproxify(Constants)
 *   // Module ID will now be set!
 *   ConstantsModuleId // ...
 * }
 * ```
 */
declare let ConstantsModuleId: Metro.ModuleID | undefined;
declare let Constants: DiscordModules.Constants;
//#endregion
export { Tokens as a, AppStartPerformance as c, LoggerModuleId as i, ConstantsModuleId as n, TokensModuleId as o, Logger as r, index_d_exports as s, Constants as t };