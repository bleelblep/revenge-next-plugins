# Known issues

Environment and build-level problems that aren't fixable by changing plugin logic. For bugs
you can introduce in plugin code, see [Porting rules](./porting-rules.md).

## Native hooks on Vector / obfuscated Xposed

JingMatrix Vector, and LSPosed with API obfuscation turned on, rename `de.robv.android.xposed` to
a random package of the same length (a stack trace shows frames like
`daXpSj.WIiCr.DxJ.UVfQn.IXposedHookLoadPackage$Wrapper`). They rewrite the Revenge module's dex
to match, but plugin jars are loaded later by Revenge and are never rewritten. A plugin compiled
against `xposed.api` then fails to load:

```
[LOAD_FAILED] Failed resolution of: Lde/robv/android/xposed/XC_MethodHook;
Caused by: java.lang.ClassNotFoundException: Didn't find class "de.robv.android.xposed.XC_MethodHook"
  on path: DexPathList[[zip file ".../plugins/dist/<id>/plugin.jar"], ...]
```

The fix is in the plugin, not revenge-xposed: don't name any `de.robv` class. `XposedCompat.kt`
(first in Live Markdown 0.1.2) builds hooks through the host's own
`io.github.revenge.xposed.MethodHookBuilder` by reflection. The host's copy is already rewritten
and isn't minified. It then finds `XposedBridge` in the same package as the `XC_MethodHook` that
the built hook extends. It works on stock LSPosed too. It depends on host internals (`MethodHookBuilder`, `HookScope`), not the
public plugin API, so check it again after a revenge-xposed update.

Every native plugin now carries its own copy. Live Markdown's has a small `hookMethod(member,
before =, after =)` API. The rest use stand-ins named like Xposed (`XC_MethodHook`,
`MethodHookParam`, `XposedBridge.hookMethod`/`log`, `XposedHelpers.callMethod`) declared in the
plugin's own package, so hook code is unchanged apart from dropping the `de.robv` imports. Never
import `de.robv.android.xposed.*` in a plugin: an import would win over the same-package stand-ins
and bring the crash back. To check a build, `de/robv` must not appear in the jar's `classes.dex`.

## JSX runtime is read eagerly

The template's build (`revenge-plugin build`) passes the JSX runtime in as an argument of the
bundle's wrapper function, which emits:

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
