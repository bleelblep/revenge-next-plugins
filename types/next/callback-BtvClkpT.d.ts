declare namespace callback_d_exports {
  export { asap, debounce, noop };
}
declare function debounce<F extends (...args: any[]) => any>(func: F, timeout: number): (...args: Parameters<F>) => Promise<unknown>;
/**
 * A function that runs the callback as soon as possible.
 * @param cb The callback to run.
 */
declare const asap: (cb: (...args: any[]) => any) => void;
declare const noop: () => void;
//#endregion
export { noop as i, callback_d_exports as n, debounce as r, asap as t };