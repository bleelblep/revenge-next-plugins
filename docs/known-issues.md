# Known issues

Environment and build-level problems that aren't fixable by changing plugin logic. For bugs
you can introduce in plugin code, see [Porting rules](./porting-rules.md).

## JSX runtime is read eagerly

`build.mjs` marks `revenge/jsx-runtime` external and maps it via Rollup's `output.globals`,
which emits:

```js
})({}, revenge.react.ReactJSXRuntime);
```

The JSX runtime is therefore read **once, as an IIFE argument, at preInit** — structurally the
same mistake as [rule 1](./porting-rules.md#1-never-touch-revenge-at-module-scope), at the
build-config level. It works today only because Metro initializes React's JSX runtime before
plugins pre-init.

PalmDevs' builds don't rely on that. They wrap it so it resolves per call:

```js
function jsx(...a) { return revenge.react.ReactJSXRuntime.jsx(...a) }
```

Not currently biting anything. Worth switching to a shim module if JSX ever breaks at boot.

## Requires a bundle newer than `10371ff`

Before revenge-bundle-next commit `10371ff` ("fix: settings UI refreshing", 2026-07-31),
`useSettingSearchResults` and `SearchableSettingsList` were never refresh-patched, and
`sRefresher.navigator` was a boolean that the first renderer to run consumed — so the other
refresh consumers never saw it.

The searchable-titles memo could then go stale and reference a setting id no longer present in
`SETTING_RENDERER_CONFIG`, which is a second, upstream path to
`Invariant Violation: Setting <id> is missing a title`. Nothing a plugin can do about it.

Test against a bundle that includes that commit.

## Clearing the module cache

Revenge persists module-lookup results (including negative ones) to a native on-disk cache.
A build that once triggered the poisoning in
[rule 1](./porting-rules.md#1-never-touch-revenge-at-module-scope) can leave a bad entry behind
that survives restarts, making a *fixed* build look identical to the broken one.

Clear the module cache before trusting any test result in that situation.
