import { t as DiscordModules } from "../../index-CkgRHGNv.js";
//#region lib/components/src/TableRowAssetIcon.d.ts
declare function TableRowAssetIcon(props: TableRowAssetIconProps): import("react").JSX.Element;
type TableRowAssetIconProps = Omit<DiscordModules.Components.TableRowIconProps, 'source'> & ({
  name: string;
  id?: never;
} | {
  name?: never;
  id: number;
});
//#endregion
export { TableRowAssetIconProps, TableRowAssetIcon as default };