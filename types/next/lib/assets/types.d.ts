import { n as Metro } from "../../types-aeIN6rX0.js";
import { t as ReactNative } from "../../types-DF_Zi2C5.js";
//#region lib/assets/src/types.d.ts
type Asset = PackagerAsset | CustomAsset;
type AssetId = number;
type PackagerAsset = ReactNative.AssetsRegistry.PackagerAsset;
interface CustomAsset extends Pick<PackagerAsset, 'name' | 'width' | 'height' | 'type' | 'id'> {
  uri: string;
  moduleId?: undefined;
}
type RegisterableAsset = Omit<CustomAsset, 'id'>;
declare module '@revenge-mod/react/types' {
  namespace ReactNative {
    namespace AssetsRegistry {
      interface PackagerAsset {
        id: AssetId;
        moduleId: Metro.ModuleID;
      }
    }
  }
}
//#endregion
export { Asset, AssetId, CustomAsset, PackagerAsset, RegisterableAsset };