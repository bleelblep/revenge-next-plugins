import FormSwitch from "./FormSwitch.js";
import Page from "./Page.js";
import SearchInput from "./SearchInput.js";
import TableRowAssetIcon from "./TableRowAssetIcon.js";
//#region lib/components/src/types.d.ts
interface PluginApiComponents {
  FormSwitch: typeof FormSwitch;
  Page: typeof Page;
  SearchInput: typeof SearchInput;
  TableRowAssetIcon: typeof TableRowAssetIcon;
}
declare module '@revenge-mod/plugins/types' {
  interface UnscopedInitPluginApi {
    components: PluginApiComponents;
  }
}
//#endregion
export { PluginApiComponents };