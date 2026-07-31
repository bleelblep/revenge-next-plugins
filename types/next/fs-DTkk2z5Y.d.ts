declare namespace fs_d_exports {
  export { deleteFileSync, exists, existsSync, getConstants, readFile, readFileSync, rm, rmSync, writeFile, writeFileSync };
}
declare function readFile(path: string): Promise<string>;
declare function writeFile(path: string, data: string): Promise<void>;
declare function exists(path: string): Promise<boolean>;
declare function rm(path: string): Promise<boolean>;
declare function existsSync(path: string): boolean;
declare function readFileSync(path: string): string;
declare function writeFileSync(path: string, data: string): void;
declare function rmSync(path: string): boolean;
declare function deleteFileSync(path: string): boolean;
declare function getConstants(): {
  data: string;
  files: string;
  cache: string;
};
declare module '@revenge-mod/modules/native' {
  interface NativeMethods {
    'revenge.fs.getConstants': [[], {
      data: string;
      files: string;
      cache: string;
    }];
    'revenge.fs.read': [[path: string], string];
    'revenge.fs.write': [[path: string, data: string], void];
    'revenge.fs.exists': [[path: string], boolean];
    'revenge.fs.delete': [[path: string], boolean];
  }
}
//#endregion
export { getConstants as a, rm as c, writeFileSync as d, fs_d_exports as i, rmSync as l, exists as n, readFile as o, existsSync as r, readFileSync as s, deleteFileSync as t, writeFile as u };